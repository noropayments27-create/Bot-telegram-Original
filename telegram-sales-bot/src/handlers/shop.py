import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

import httpx
from aiogram import F, Router
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
)
from ..utils.main_view import render_main_view, set_main_message_id
from ..utils.rate_limit import check_global_rate_limit

router = Router()
api_client = ApiClient(API_BASE_URL, API_TOKEN)
_SCREENSHOTS_RECEIVED: Set[str] = set()
_PRODUCT_ID_CACHE: List[str] = []

_NUMBER_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"]
_SHOP_PAGES = [
    [
        "💳 Venta de Tarjetas",
        "🔗 Links de CCS Shop",
        "🕵️ Foros de Carding",
        "📊 Paneles SMM",
        "📲 Paneles SMS",
        "🎁 Paneles Gift Card",
        "🎬 Paneles Streaming",
        "🎮 Paneles de Juegos",
        "📧 Emails Temporales",
    ],
    [
        "🌐 Hosting y Dominios",
        "🧾 Logs y Bases de Datos",
        "🛡️ VPN Premium",
        "🧰 Herramientas Digitales",
        "📥 Descargas Premium",
        "🤖 Bots Automatizados",
        "💼 Servicios Freelance",
        "🧑‍💻 Cursos y Tutoriales",
        "🔐 Cuentas Verificadas",
    ],
]


class PaymentStates(StatesGroup):
    waiting_photo = State()


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


def build_detail_back_keyboard(page: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="⬅️ Back", callback_data=f"shop:page:{page}"),
                InlineKeyboardButton(text="🏠 Inicio", callback_data="home:show"),
            ]
        ]
    )


def get_shop_page(page: int) -> List[str]:
    if 1 <= page <= len(_SHOP_PAGES):
        return _SHOP_PAGES[page - 1]
    return []


def format_products(items: List[str], page: int) -> str:
    if not items:
        return "No hay mas productos disponibles."

    lines = [f"Productos Disponibles (Página {page})", ""]
    for idx, item in enumerate(items, start=1):
        lines.append(f"{_NUMBER_EMOJIS[idx - 1]} {item}")
    return "\n".join(lines)


async def get_active_product_ids() -> List[str]:
    if _PRODUCT_ID_CACHE:
        return _PRODUCT_ID_CACHE

    product_ids: List[str] = []
    page = 1
    total_pages = 1
    while page <= total_pages:
        data = await api_client.list_products(page=page, page_size=50)
        total_pages = data.get("total_pages", total_pages)
        items = data.get("items", [])
        for item in items:
            product_id = item.get("id")
            if product_id:
                product_ids.append(product_id)
        page += 1

    _PRODUCT_ID_CACHE.extend(product_ids)
    return _PRODUCT_ID_CACHE


async def resolve_product_id(page: int, index: int) -> Optional[str]:
    product_ids = await get_active_product_ids()
    if not product_ids:
        return None
    global_index = (page - 1) * 9 + (index - 1)
    if 0 <= global_index < len(product_ids):
        return product_ids[global_index]
    return product_ids[0]


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
    items = get_shop_page(page)
    total_pages = len(_SHOP_PAGES)

    if not items:
        await render_main_view(target, user_id, "No hay mas productos disponibles.")
        return

    text = format_products(items, page)
    await render_main_view(
        target, user_id, text, reply_markup=build_shop_keyboard(page, total_pages)
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


@router.callback_query(F.data.startswith("shop:select:"))
async def handle_product_select(callback: CallbackQuery) -> None:
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
    items = get_shop_page(page)
    if index < 1 or index > len(items):
        await callback.answer("No se encontro el producto.", show_alert=True)
        return

    product_name = items[index - 1]
    text = (
        f"{product_name}\n\n"
        "Descripción:\n"
        "Información del producto disponible próximamente.\n\n"
        "Precio: **$20 USD**"
    )
    keyboard = build_product_detail_keyboard(page, index)
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
    product_id = await resolve_product_id(page, index)
    if not product_id:
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
        "product_id": product_id,
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

    await state.update_data(last_order_id=order["id"], current_order_id=order["id"])
    await render_main_view(
        callback.message,
        callback.from_user.id,
        "Elije tu método de pago:",
        reply_markup=build_payment_methods_keyboard(order["id"], page, index),
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
    await render_main_view(
        callback.message,
        callback.from_user.id,
        "Carrito próximamente",
        reply_markup=build_detail_back_keyboard(page),
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
async def handle_order_method(callback: CallbackQuery) -> None:
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
    method_names = {
        "nequi": "Nequi",
        "binance": "Binance ID",
        "crypto": "Cripto Monedas",
        "mp": "Mercado Pago",
        "paypal": "Paypal +25%",
    }
    method_label = method_names.get(method_key, "Método")
    page = int(page_text)
    index = int(index_text)
    text = (
        f"{method_label}\n\n"
        "Instrucciones próximamente.\n\n"
        "Enviame la captura del pago."
    )
    await render_main_view(
        callback.message,
        callback.from_user.id,
        text,
        reply_markup=build_payment_prompt_keyboard(order_id, page, index),
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

    await state.update_data(last_order_id=order["id"], current_order_id=order["id"])

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
