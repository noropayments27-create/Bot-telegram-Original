import asyncio
import html
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

import httpx
from aiogram import F, Router
from aiogram.enums import ParseMode
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)

from ..services.api_client import ApiClient
from ..config import (
    API_BASE_URL,
    API_TOKEN,
    BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    BOT_RATE_LIMIT_ENABLED,
    BOT_RATE_LIMIT_SECONDS,
    BINANCE_ID,
    CRYPTO_WALLET_BTC,
    CRYPTO_WALLET_LTC,
    CRYPTO_WALLET_USDT,
    MERCADOPAGO_ACCOUNT,
    NEQUI_NAME,
    NEQUI_NUMBER,
    PAYPAL_ACCOUNT,
)
from ..utils.main_view import render_main_view, set_main_message_id
from ..utils.rate_limit import check_global_rate_limit

router = Router()
api_client = ApiClient(API_BASE_URL, API_TOKEN)
_SCREENSHOTS_RECEIVED: Set[str] = set()
_DEFAULT_PRODUCT_PRICE_USD = 20.0

_NUMBER_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"]
_PAGE_SIZE = 9
_PREFIX_SHOP = "SHOP "
_PREFIX_METODOS = "METODOS "
_PREFIX_VIP = "VIP "
_PREFIX_WEB = "WEB "
_CATEGORY_PREFIXES = {
    "metodos": _PREFIX_METODOS,
    "vip": _PREFIX_VIP,
    "programas": _PREFIX_WEB,
}
_CATEGORY_TITLES = {
    "metodos": "✅ Métodos",
    "vip": "💬 VIP",
    "programas": "💻 Programas y Web",
}


class PaymentStates(StatesGroup):
    waiting_photo = State()


def _format_usd(amount: float) -> str:
    return f"{amount:.2f}"


def _build_cart_text(cart_items: List[Dict[str, Any]], total_usd: float) -> str:
    if not cart_items:
        return "Carrito de Compras\n\nCarrito vacío."

    lines = ["Carrito de Compras", "Tienes Añadido:"]
    for idx, item in enumerate(cart_items, start=1):
        name = html.escape(_strip_category_prefix(item["name"]))
        qty = int(item["qty"])
        lines.append(f"{idx}. {name} x{qty}")
    lines.append("")
    lines.append(f"Precio Total: <b>${_format_usd(total_usd)} USD</b>")
    return "\n".join(lines)


def _build_cart_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="🛍️ Comprar Todo", callback_data="cart:checkout"),
                InlineKeyboardButton(text="🗑️ Borrar Todo", callback_data="cart:clear"),
            ],
            [
                InlineKeyboardButton(text="⬅️ Back", callback_data="shop:page:1"),
                InlineKeyboardButton(text="🏠 Inicio", callback_data="home:show"),
            ],
        ]
    )


def _build_cart_summary(cart_items: List[Dict[str, Any]], total_usd: float) -> str:
    if not cart_items:
        return ""
    lines = ["Resumen del carrito:"]
    for idx, item in enumerate(cart_items, start=1):
        name = html.escape(_strip_category_prefix(item["name"]))
        qty = int(item["qty"])
        lines.append(f"{idx}. {name} x{qty}")
    lines.append(f"Total: ${_format_usd(total_usd)} USD")
    return "\n".join(lines)


def _build_payment_instructions(
    method_key: str,
    base_total: Optional[float],
    summary: Optional[str],
) -> str:
    total = float(base_total) if base_total is not None else _DEFAULT_PRODUCT_PRICE_USD
    total_text = _format_usd(total)
    instructions: List[str] = []

    if method_key == "nequi":
        instructions.append("Nequi")
        if NEQUI_NAME:
            instructions.append(f"Nombre: {html.escape(NEQUI_NAME)}")
        if NEQUI_NUMBER:
            instructions.append(f"Número: {html.escape(NEQUI_NUMBER)}")
    elif method_key == "binance":
        instructions.append("Binance ID")
        if BINANCE_ID:
            instructions.append(f"ID: {html.escape(BINANCE_ID)}")
    elif method_key == "crypto":
        instructions.append("Cripto Monedas")
        if CRYPTO_WALLET_USDT:
            instructions.append(f"USDT: {html.escape(CRYPTO_WALLET_USDT)}")
        if CRYPTO_WALLET_BTC:
            instructions.append(f"BTC: {html.escape(CRYPTO_WALLET_BTC)}")
        if CRYPTO_WALLET_LTC:
            instructions.append(f"LTC: {html.escape(CRYPTO_WALLET_LTC)}")
    elif method_key == "mp":
        instructions.append("Mercado Pago")
        if MERCADOPAGO_ACCOUNT:
            instructions.append(f"Cuenta: {html.escape(MERCADOPAGO_ACCOUNT)}")
    elif method_key == "paypal":
        instructions.append("Paypal +25%")
        total = total * 1.25
        total_text = _format_usd(total)
        if PAYPAL_ACCOUNT:
            instructions.append(f"Cuenta: {html.escape(PAYPAL_ACCOUNT)}")
    else:
        instructions.append("Método de pago")

    instructions.append("")
    if summary:
        instructions.append(summary)
        instructions.append("")
    instructions.append(f"Total: <b>${total_text} USD</b>")
    instructions.append("<b><i>Luego que hagas el pago, toma una captura</i></b>")
    return "\n".join(instructions)


def build_shop_keyboard(page: int, total_pages: int) -> InlineKeyboardMarkup:
    rows: List[List[InlineKeyboardButton]] = []

    for row_start in range(0, 9, 3):
        rows.append(
            [
                InlineKeyboardButton(
                    text=_NUMBER_EMOJIS[idx],
                    callback_data=f"shop:select:{page}:{idx + 1}",
                )
                for idx in range(row_start, row_start + 3)
            ]
        )

    nav_row: List[InlineKeyboardButton] = []
    if total_pages > 1:
        if page > 1:
            nav_row.append(
                InlineKeyboardButton(text="⬅️ <<", callback_data=f"shop:page:{page - 1}")
            )
        if page < total_pages:
            nav_row.append(
                InlineKeyboardButton(
                    text=">> ➡️", callback_data=f"shop:page:{page + 1}"
                )
            )
        if nav_row:
            rows.append(nav_row)
    rows.append(
        [
            InlineKeyboardButton(text="⬅️ Back", callback_data="home:show"),
            InlineKeyboardButton(text="🏠 Inicio", callback_data="home:show"),
        ]
    )

    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_product_detail_keyboard(page: int, index: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🛍️ Comprar", callback_data=f"shop:buy:{page}:{index}"
                )
            ],
            [
                InlineKeyboardButton(
                    text="📥 Añadir al Carrito",
                    callback_data=f"shop:cart:{page}:{index}",
                )
            ],
            [
                InlineKeyboardButton(text="⬅️ Back", callback_data=f"shop:page:{page}"),
                InlineKeyboardButton(text="🏠 Inicio", callback_data="home:show"),
            ],
        ]
    )


def build_category_keyboard(category_key: str) -> InlineKeyboardMarkup:
    rows: List[List[InlineKeyboardButton]] = []
    for row_start in range(0, 9, 3):
        rows.append(
            [
                InlineKeyboardButton(
                    text=_NUMBER_EMOJIS[idx],
                    callback_data=f"category:select:{category_key}:{idx + 1}",
                )
                for idx in range(row_start, row_start + 3)
            ]
        )
    rows.append(
        [
            InlineKeyboardButton(text="⬅️ Back", callback_data="home:show"),
            InlineKeyboardButton(text="🏠 Inicio", callback_data="home:show"),
        ]
    )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_category_detail_keyboard(category_key: str, index: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🛍️ Comprar",
                    callback_data=f"category:buy:{category_key}:{index}",
                )
            ],
            [
                InlineKeyboardButton(
                    text="📥 Añadir al Carrito",
                    callback_data=f"category:cart:{category_key}:{index}",
                )
            ],
            [
                InlineKeyboardButton(
                    text="⬅️ Back", callback_data=f"category:page:{category_key}"
                ),
                InlineKeyboardButton(text="🏠 Inicio", callback_data="home:show"),
            ],
        ]
    )


def build_detail_back_keyboard(page: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="⬅️ Back", callback_data=f"shop:page:{page}"),
                InlineKeyboardButton(text="🏠 Inicio", callback_data="home:show"),
            ]
        ]
    )


def get_category_title(category_key: str) -> str:
    return _CATEGORY_TITLES.get(category_key, "Categoría")


def format_products(items: List[Dict[str, Any]], page: int) -> str:
    if not items:
        return "No hay mas productos disponibles."

    lines = [f"Productos Disponibles (Página {page})", ""]
    for idx, item in enumerate(items, start=1):
        lines.append(f"{_NUMBER_EMOJIS[idx - 1]} {item['display_name']}")
    return "\n".join(lines)


def format_category_products(category_key: str, items: List[Dict[str, Any]]) -> str:
    if not items:
        return "No hay mas productos disponibles."
    title = get_category_title(category_key)
    lines = [f"{title} (Página 1)", ""]
    for idx, item in enumerate(items, start=1):
        lines.append(f"{_NUMBER_EMOJIS[idx - 1]} {item['display_name']}")
    return "\n".join(lines)


async def _fetch_active_products() -> List[Dict[str, Any]]:
    products: List[Dict[str, Any]] = []
    page = 1
    total_pages = 1
    while page <= total_pages:
        data = await api_client.list_products(page=page, page_size=50)
        total_pages = data.get("total_pages", total_pages)
        items = data.get("items", [])
        if isinstance(items, list):
            products.extend(items)
        page += 1
    return products


_PREFIXES_FOR_STRIP = ("SHOP", "METODOS", "VIP", "WEB")


def _strip_category_prefix(name: str) -> str:
    cleaned = name.strip()
    for base in _PREFIXES_FOR_STRIP:
        base_prefix = f"{base} "
        if not cleaned.startswith(base_prefix):
            continue
        remainder = cleaned[len(base_prefix) :]
        if remainder.startswith("- "):
            return remainder[2:].strip()
        if " - " in remainder:
            maybe_code, rest = remainder.split(" - ", 1)
            if maybe_code.isdigit():
                return rest.strip()
    return cleaned


def _normalize_product(product: Dict[str, Any], prefix: str) -> Dict[str, Any]:
    name = str(product.get("name") or "")
    return {
        "id": product.get("id"),
        "code": product.get("code"),
        "name": name,
        "display_name": _strip_category_prefix(name),
        "description": product.get("description") or "Producto de prueba",
        "price": float(product.get("price") or _DEFAULT_PRODUCT_PRICE_USD),
    }


def _format_code_line(product: Dict[str, Any]) -> str:
    code = str(product.get("code") or "").strip()
    if not code:
        return ""
    return f"Código: {code}\n\n"


async def _get_products_by_prefix(prefix: str) -> List[Dict[str, Any]]:
    products = await _fetch_active_products()
    filtered = [
        _normalize_product(product, prefix)
        for product in products
        if str(product.get("name") or "").startswith(prefix)
    ]
    filtered.sort(key=lambda item: item["name"])
    return filtered


def _paginate(items: List[Dict[str, Any]], page: int) -> List[Dict[str, Any]]:
    start = (page - 1) * _PAGE_SIZE
    end = start + _PAGE_SIZE
    return items[start:end]


async def _get_shop_page_items(page: int) -> Dict[str, Any]:
    products = await _get_products_by_prefix(_PREFIX_SHOP)
    total_pages = max((len(products) + _PAGE_SIZE - 1) // _PAGE_SIZE, 1)
    return {
        "items": _paginate(products, page),
        "total_pages": total_pages,
    }


async def _get_category_items(category_key: str) -> List[Dict[str, Any]]:
    prefix = _CATEGORY_PREFIXES.get(category_key)
    if not prefix:
        return []
    products = await _get_products_by_prefix(prefix)
    return _paginate(products, 1)


def build_payment_methods_keyboard(
    order_id: str, page: int, index: int
) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Nequi",
                    callback_data=f"order:method:{order_id}:{page}:{index}:nequi",
                )
            ],
            [
                InlineKeyboardButton(
                    text="Binance ID",
                    callback_data=f"order:method:{order_id}:{page}:{index}:binance",
                )
            ],
            [
                InlineKeyboardButton(
                    text="Cripto Monedas",
                    callback_data=f"order:method:{order_id}:{page}:{index}:crypto",
                )
            ],
            [
                InlineKeyboardButton(
                    text="Mercado Pago",
                    callback_data=f"order:method:{order_id}:{page}:{index}:mp",
                )
            ],
            [
                InlineKeyboardButton(
                    text="Paypal +25%",
                    callback_data=f"order:method:{order_id}:{page}:{index}:paypal",
                )
            ],
        ]
    )


def build_payment_prompt_keyboard(
    order_id: str, page: int, index: int
) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ Ya pagué", callback_data=f"order:pay:{order_id}"
                ),
                InlineKeyboardButton(
                    text="⬅️ Back",
                    callback_data=f"order:methods:{order_id}:{page}:{index}",
                ),
            ],
            [InlineKeyboardButton(text="🏠 Inicio", callback_data="home:show")],
        ]
    )


async def render_shop_page(target: Message, user_id: int, page: int) -> None:
    catalog = await _get_shop_page_items(page)
    items = catalog["items"]
    total_pages = catalog["total_pages"]

    if not items:
        await render_main_view(target, user_id, "No hay mas productos disponibles.")
        return

    text = format_products(items, page)
    await render_main_view(
        target, user_id, text, reply_markup=build_shop_keyboard(page, total_pages)
    )


async def render_category_page(
    target: Message, user_id: int, category_key: str
) -> None:
    items = await _get_category_items(category_key)
    if not items:
        await render_main_view(target, user_id, "No hay mas productos disponibles.")
        return
    text = format_category_products(category_key, items)
    await render_main_view(
        target,
        user_id,
        text,
        reply_markup=build_category_keyboard(category_key),
    )


@router.message(Command("shop"))
@router.message(F.text == "🛒 Tienda")
async def handle_shop(message: Message) -> None:
    if not message.from_user:
        return
    wait_seconds = check_global_rate_limit(
        message.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await message.answer(f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.")
        return
    await render_shop_page(message, message.from_user.id, 1)


@router.callback_query(F.data.startswith("shop:page:"))
async def handle_shop_page(callback: CallbackQuery) -> None:
    if not callback.message or not callback.from_user:
        return
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.", show_alert=True
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    page = int(callback.data.split(":")[-1])
    await render_shop_page(callback.message, callback.from_user.id, page)
    await callback.answer()


@router.callback_query(F.data.startswith("category:page:"))
async def handle_category_page(callback: CallbackQuery) -> None:
    if not callback.message or not callback.from_user:
        return
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.", show_alert=True
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    category_key = callback.data.split(":")[-1]
    await render_category_page(callback.message, callback.from_user.id, category_key)
    await callback.answer()


@router.callback_query(F.data.startswith("shop:select:"))
async def handle_product_select(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.", show_alert=True
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    _, _, page_text, index_text = callback.data.split(":", 3)
    page = int(page_text)
    index = int(index_text)
    catalog = await _get_shop_page_items(page)
    items = catalog["items"]
    if index < 1 or index > len(items):
        await callback.answer("No se encontro el producto.", show_alert=True)
        return

    product = items[index - 1]
    await state.update_data(selected_product_id=product["id"])
    text = (
        f"{product['display_name']}\n\n"
        f"{_format_code_line(product)}"
        "Descripción:\n"
        f"{product['description']}\n\n"
        f"Precio: **${int(product['price'])} USD**"
    )
    keyboard = build_product_detail_keyboard(page, index)
    await render_main_view(
        callback.message,
        callback.from_user.id,
        text,
        reply_markup=keyboard,
    )
    await callback.answer()


@router.callback_query(F.data.startswith("category:select:"))
async def handle_category_select(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.", show_alert=True
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    _, _, category_key, index_text = callback.data.split(":", 3)
    index = int(index_text)
    items = await _get_category_items(category_key)
    if index < 1 or index > len(items):
        await callback.answer("No se encontro el producto.", show_alert=True)
        return
    item = items[index - 1]
    await state.update_data(selected_product_id=item["id"])
    text = (
        f"{item['display_name']}\n\n"
        f"{_format_code_line(item)}"
        "Descripción:\n"
        f"{item['description']}\n\n"
        f"Precio: **${int(item['price'])} USD**"
    )
    keyboard = build_category_detail_keyboard(category_key, index)
    await render_main_view(
        callback.message,
        callback.from_user.id,
        text,
        reply_markup=keyboard,
    )
    await callback.answer()


@router.callback_query(F.data.startswith("shop:buy:"))
async def handle_shop_buy(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.", show_alert=True
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    _, _, page_text, index_text = callback.data.split(":", 3)
    page = int(page_text)
    index = int(index_text)
    catalog = await _get_shop_page_items(page)
    items = catalog["items"]
    if index < 1 or index > len(items):
        await callback.answer("No se encontro el producto.", show_alert=True)
        return
    product = items[index - 1]
    if not product.get("id"):
        await render_main_view(
            callback.message,
            callback.from_user.id,
            "No hay productos disponibles.",
            reply_markup=build_detail_back_keyboard(page),
        )
        await callback.answer()
        return

    order_payload = {
        "telegram_id": callback.from_user.id,
        "product_id": product["id"],
        "qty": 1,
        "username": callback.from_user.username,
    }

    result = await api_client.create_order(order_payload)
    order = result.get("order")
    if not order:
        await render_main_view(
            callback.message,
            callback.from_user.id,
            "No se pudo crear la orden.",
            reply_markup=build_detail_back_keyboard(page),
        )
        await callback.answer()
        return

    await state.update_data(
        last_order_id=order["id"],
        current_order_id=order["id"],
        current_order_total=order.get("total"),
        current_order_summary=None,
    )
    await render_main_view(
        callback.message,
        callback.from_user.id,
        "Elije tu método de pago:",
        reply_markup=build_payment_methods_keyboard(order["id"], page, index),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("category:buy:"))
async def handle_category_buy(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.", show_alert=True
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    _, _, category_key, index_text = callback.data.split(":", 3)
    index = int(index_text)
    items = await _get_category_items(category_key)
    if index < 1 or index > len(items):
        await callback.answer("No se encontro el producto.", show_alert=True)
        return
    product = items[index - 1]
    if not product.get("id"):
        await render_main_view(
            callback.message,
            callback.from_user.id,
            "No hay productos disponibles.",
            reply_markup=build_category_detail_keyboard(category_key, index),
        )
        await callback.answer()
        return

    order_payload = {
        "telegram_id": callback.from_user.id,
        "product_id": product["id"],
        "qty": 1,
        "username": callback.from_user.username,
    }

    result = await api_client.create_order(order_payload)
    order = result.get("order")
    if not order:
        await render_main_view(
            callback.message,
            callback.from_user.id,
            "No se pudo crear la orden.",
            reply_markup=build_category_detail_keyboard(category_key, index),
        )
        await callback.answer()
        return

    await state.update_data(
        last_order_id=order["id"],
        current_order_id=order["id"],
        current_order_total=order.get("total"),
        current_order_summary=None,
    )
    await render_main_view(
        callback.message,
        callback.from_user.id,
        "Elije tu método de pago:",
        reply_markup=build_payment_methods_keyboard(order["id"], 1, 1),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("shop:cart:"))
async def handle_shop_cart(callback: CallbackQuery) -> None:
    if not callback.message or not callback.from_user:
        return
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.", show_alert=True
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    _, _, page_text, _ = callback.data.split(":", 3)
    page = int(page_text)
    catalog = await _get_shop_page_items(page)
    items = catalog["items"]
    index_text = callback.data.split(":")[-1]
    index = int(index_text)
    if index < 1 or index > len(items):
        await callback.answer("No se encontro el producto.", show_alert=True)
        return
    product = items[index - 1]
    if not product.get("id"):
        await callback.answer("No se encontro el producto.", show_alert=True)
        return
    try:
        await api_client.add_to_cart(
            {
                "telegram_id": callback.from_user.id,
                "product_id": product["id"],
                "qty": 1,
                "username": callback.from_user.username,
            }
        )
        add_result = "Añadido al carrito ✅"
    except httpx.HTTPStatusError:
        add_result = "No se pudo añadir al carrito."
    text = (
        f"{product['display_name']}\n\n"
        f"{_format_code_line(product)}"
        "Descripción:\n"
        f"{product['description']}\n\n"
        f"Precio: **${int(product['price'])} USD**\n\n"
        f"{add_result}"
    )
    keyboard = build_product_detail_keyboard(page, index)
    await render_main_view(
        callback.message,
        callback.from_user.id,
        text,
        reply_markup=keyboard,
    )
    await callback.answer()


@router.callback_query(F.data.startswith("category:cart:"))
async def handle_category_cart(callback: CallbackQuery) -> None:
    if not callback.message or not callback.from_user:
        return
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.", show_alert=True
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    _, _, category_key, index_text = callback.data.split(":", 3)
    index = int(index_text)
    items = await _get_category_items(category_key)
    if index < 1 or index > len(items):
        await callback.answer("No se encontro el producto.", show_alert=True)
        return
    item = items[index - 1]
    if not item.get("id"):
        await callback.answer("No se encontro el producto.", show_alert=True)
        return
    try:
        await api_client.add_to_cart(
            {
                "telegram_id": callback.from_user.id,
                "product_id": item["id"],
                "qty": 1,
                "username": callback.from_user.username,
            }
        )
        add_result = "Añadido al carrito ✅"
    except httpx.HTTPStatusError:
        add_result = "No se pudo añadir al carrito."
    text = (
        f"{item['display_name']}\n\n"
        f"{_format_code_line(item)}"
        "Descripción:\n"
        f"{item['description']}\n\n"
        f"Precio: **${int(item['price'])} USD**\n\n"
        f"{add_result}"
    )
    keyboard = build_category_detail_keyboard(category_key, index)
    await render_main_view(
        callback.message,
        callback.from_user.id,
        text,
        reply_markup=keyboard,
    )
    await callback.answer()


@router.callback_query(F.data == "home:cart")
async def handle_home_cart(callback: CallbackQuery) -> None:
    if not callback.message or not callback.from_user:
        return
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.", show_alert=True
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    cart_data = await api_client.get_cart(callback.from_user.id)
    cart_items = cart_data.get("items", [])
    total_usd = float(cart_data.get("total_usd", 0))
    await render_main_view(
        callback.message,
        callback.from_user.id,
        _build_cart_text(cart_items, total_usd),
        reply_markup=_build_cart_keyboard(),
        parse_mode=ParseMode.HTML,
    )
    await callback.answer()


@router.callback_query(F.data == "cart:clear")
async def handle_cart_clear(callback: CallbackQuery) -> None:
    if not callback.message or not callback.from_user:
        return
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.", show_alert=True
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    await api_client.clear_cart({"telegram_id": callback.from_user.id})
    await render_main_view(
        callback.message,
        callback.from_user.id,
        _build_cart_text([], 0.0),
        reply_markup=_build_cart_keyboard(),
        parse_mode=ParseMode.HTML,
    )
    await callback.answer()


@router.callback_query(F.data == "cart:checkout")
async def handle_cart_checkout(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.", show_alert=True
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    cart_data = await api_client.get_cart(callback.from_user.id)
    cart_items = cart_data.get("items", [])
    cart_total = float(cart_data.get("total_usd", 0))
    if not cart_items:
        await render_main_view(
            callback.message,
            callback.from_user.id,
            "Tu carrito está vacío.",
        )
        await callback.answer()
        return
    cart_summary = _build_cart_summary(cart_items, cart_total)
    try:
        result = await api_client.checkout_cart(
            {"telegram_id": callback.from_user.id, "username": callback.from_user.username}
        )
    except httpx.HTTPStatusError:
        await render_main_view(
            callback.message,
            callback.from_user.id,
            "Error procesando la compra. Intenta de nuevo.",
        )
        await callback.answer()
        return

    order_id = result.get("order_id")
    cart_total = float(result.get("total_usd", cart_total))
    if not order_id:
        await render_main_view(
            callback.message,
            callback.from_user.id,
            "No se pudo crear la orden.",
        )
        await callback.answer()
        return
    await state.update_data(
        last_order_id=order_id,
        current_order_id=order_id,
        current_order_total=cart_total,
        current_order_summary=cart_summary,
    )
    await render_main_view(
        callback.message,
        callback.from_user.id,
        "Elije tu método de pago:",
        reply_markup=build_payment_methods_keyboard(order_id, 1, 1),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("order:methods:"))
async def handle_order_methods(callback: CallbackQuery) -> None:
    if not callback.message or not callback.from_user:
        return
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.", show_alert=True
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    _, _, order_id, page_text, index_text = callback.data.split(":", 4)
    page = int(page_text)
    index = int(index_text)
    await render_main_view(
        callback.message,
        callback.from_user.id,
        "Elije tu método de pago:",
        reply_markup=build_payment_methods_keyboard(order_id, page, index),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("order:method:"))
async def handle_order_method(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.", show_alert=True
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    _, _, order_id, page_text, index_text, method_key = callback.data.split(":", 5)
    page = int(page_text)
    index = int(index_text)
    data = await state.get_data()
    total = data.get("current_order_total")
    summary = data.get("current_order_summary")
    text = _build_payment_instructions(method_key, total, summary)
    await render_main_view(
        callback.message,
        callback.from_user.id,
        text,
        reply_markup=build_payment_prompt_keyboard(order_id, page, index),
        parse_mode=ParseMode.HTML,
    )
    await callback.answer()


@router.callback_query(F.data.startswith("order:create:"))
async def handle_create_order(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.", show_alert=True
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    parts = callback.data.split(":")
    product_id = parts[2] if len(parts) > 2 else parts[-1]
    page = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else 1

    order_payload = {
        "telegram_id": callback.from_user.id,
        "product_id": product_id,
        "qty": 1,
        "username": callback.from_user.username,
    }

    result = await api_client.create_order(order_payload)
    order = result.get("order")
    instructions = result.get("payment_instructions", {})

    if not order:
        await render_main_view(
            callback.message,
            callback.from_user.id,
            "No se pudo crear la orden.",
        )
        await callback.answer()
        return

    await state.update_data(
        last_order_id=order["id"],
        current_order_id=order["id"],
        current_order_total=order.get("total"),
        current_order_summary=None,
    )

    text = (
        "Orden creada.\n"
        f"ID: {order['id']}\n"
        f"Total: ${order.get('total')}\n\n"
        "Instrucciones de pago:\n"
        f"Red: {instructions.get('network')}\n"
        f"Activo: {instructions.get('asset')}\n"
        f"Wallet: {instructions.get('wallet')}\n"
        f"Nota: {instructions.get('note')}"
    )

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ Ya pagué", callback_data=f"order:pay:{order['id']}"
                ),
                InlineKeyboardButton(
                    text="📦 Ver estado",
                    callback_data=f"order:status:{order['id']}",
                ),
            ],
            [
                InlineKeyboardButton(
                    text="⬅️ Back",
                    callback_data=f"shop:page:{page}",
                )
            ],
        ]
    )

    await render_main_view(
        callback.message,
        callback.from_user.id,
        text,
        reply_markup=keyboard,
    )
    await callback.answer()


@router.callback_query(F.data.startswith("order:pay:"))
async def handle_pay(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.", show_alert=True
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    order_id = callback.data.split(":")[-1]
    filtered_markup = None
    if callback.message.reply_markup:
        rows = []
        for row in callback.message.reply_markup.inline_keyboard:
            filtered = [
                button
                for button in row
                if not (button.callback_data or "").startswith("order:pay:")
            ]
            if filtered:
                rows.append(filtered)
        if rows:
            filtered_markup = InlineKeyboardMarkup(inline_keyboard=rows)
        try:
            await callback.message.edit_reply_markup(
                reply_markup=filtered_markup
            )
        except Exception:
            pass
    await state.update_data(order_id=order_id, current_order_id=order_id)
    await state.set_state(PaymentStates.waiting_photo)
    await render_main_view(
        callback.message,
        callback.from_user.id,
        "Enviame la captura del pago.",
        reply_markup=filtered_markup,
    )
    await callback.answer()


@router.message(F.photo)
async def handle_payment_photo(message: Message, state: FSMContext) -> None:
    if not message.photo or not message.from_user:
        return
    wait_seconds = check_global_rate_limit(
        message.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await message.answer(f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.")
        return

    data = await state.get_data()
    order_id = data.get("order_id") or data.get("current_order_id")
    if not order_id:
        await message.answer("No tengo una orden activa. Presiona Comprar nuevamente.")
        await state.set_state(None)
        return

    screenshot_file_id = message.photo[-1].file_id
    payload = {
        "telegram_id": message.from_user.id,
        "screenshot_file_id": screenshot_file_id,
    }

    try:
        await api_client.submit_payment_proof(order_id, payload)
    except httpx.HTTPStatusError as exc:
        error_payload: Optional[Dict[str, Any]] = None
        try:
            error_payload = exc.response.json()
        except Exception:
            error_payload = None
        error_code = error_payload.get("error") if isinstance(error_payload, dict) else None
        if error_code == "SCREENSHOT_ALREADY_SUBMITTED":
            notice = await message.answer(
                "Ya recibimos tu imagen, espera que aprobemos tu pago."
            )
            await asyncio.sleep(3)
            try:
                await notice.delete()
            except Exception:
                pass
            return
        raise
    _SCREENSHOTS_RECEIVED.add(order_id)
    await message.answer("Recibido. Estamos verificando tu pago.")
    await state.update_data(order_id=None)
    await state.set_state(None)


@router.callback_query(F.data.startswith("order:status:"))
async def handle_status_callback(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.", show_alert=True
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    order_id = callback.data.split(":")[-1]
    await state.update_data(last_order_id=order_id)
    await send_order_status(callback.message, callback.from_user.id, order_id)
    await callback.answer()


@router.message(F.text == "📦 Ver estado")
async def handle_status_message(message: Message, state: FSMContext) -> None:
    if not message.from_user:
        return
    wait_seconds = check_global_rate_limit(
        message.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await message.answer(f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.")
        return
    data = await state.get_data()
    order_id = data.get("last_order_id")
    if not order_id:
        await render_main_view(
            message, message.from_user.id, "No hay ordenes recientes para consultar."
        )
        return
    await send_order_status(message, message.from_user.id, order_id)


def format_receipt(order: Dict[str, Any]) -> str:
    total = order.get("unit_price_at_purchase")
    paid_at = order.get("paid_at") or order.get("created_at")
    paid_at_text = paid_at
    if isinstance(paid_at, datetime):
        paid_at_text = paid_at.isoformat()

    return (
        "Recibo digital\n"
        f"Orden: {order['id']}\n"
        f"Producto: {order.get('product_id')}\n"
        "Cantidad: 1\n"
        f"Total: ${total}\n"
        f"Fecha: {paid_at_text}\n"
        "Estado: PAGADA"
    )


async def send_order_status(target: Message, user_id: int, order_id: str) -> None:
    result = await api_client.get_order(order_id)
    order = result.get("order")

    if not order:
        await render_main_view(target, user_id, "No se encontro la orden.")
        return

    status = order.get("status")
    if status == "PAID":
        await render_main_view(target, user_id, format_receipt(order))
    elif status == "WAITING_PAYMENT":
        await render_main_view(target, user_id, "Pago en revision.")
    elif status == "CREATED":
        await render_main_view(target, user_id, "Pendiente de pago.")
    elif status == "CANCELLED":
        await render_main_view(target, user_id, "Pago rechazado, contacta soporte.")
    else:
        await render_main_view(target, user_id, f"Estado actual: {status}")
