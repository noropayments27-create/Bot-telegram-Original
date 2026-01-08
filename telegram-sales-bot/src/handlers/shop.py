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
_PRODUCT_ID_CACHE: List[str] = []
_CART_BY_USER: Dict[int, Dict[str, Dict[str, Any]]] = {}
_DEFAULT_PRODUCT_PRICE_USD = 20.0

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
_CATEGORY_CATALOGS: Dict[str, Dict[str, Any]] = {
    "metodos": {
        "title": "✅ Métodos",
        "items": [
            {
                "item_key": "metodos_01",
                "name": "✅ Método Flux",
                "description": "Guía rápida para validar flujos diarios.",
                "price_usd": 20.0,
            },
            {
                "item_key": "metodos_02",
                "name": "✅ Método Atlas",
                "description": "Estrategia de control con pasos simples.",
                "price_usd": 20.0,
            },
            {
                "item_key": "metodos_03",
                "name": "✅ Método Prisma",
                "description": "Checklist práctico para optimizar procesos.",
                "price_usd": 20.0,
            },
            {
                "item_key": "metodos_04",
                "name": "✅ Método Vector",
                "description": "Plan de acción en 5 movimientos.",
                "price_usd": 20.0,
            },
            {
                "item_key": "metodos_05",
                "name": "✅ Método Delta",
                "description": "Ejecución directa con métricas claras.",
                "price_usd": 20.0,
            },
            {
                "item_key": "metodos_06",
                "name": "✅ Método Pulse",
                "description": "Rutina para mantener resultados constantes.",
                "price_usd": 20.0,
            },
            {
                "item_key": "metodos_07",
                "name": "✅ Método Nova",
                "description": "Sistema express para nuevos usuarios.",
                "price_usd": 20.0,
            },
            {
                "item_key": "metodos_08",
                "name": "✅ Método Sigma",
                "description": "Secuencia avanzada para escalar rápido.",
                "price_usd": 20.0,
            },
            {
                "item_key": "metodos_09",
                "name": "✅ Método Orion",
                "description": "Guía completa con ajustes recomendados.",
                "price_usd": 20.0,
            },
        ],
    },
    "vip": {
        "title": "💬 Grupos VIP",
        "items": [
            {
                "item_key": "vip_01",
                "name": "💬 VIP Aurora",
                "description": "Acceso VIP con alertas diarias.",
                "price_usd": 25.0,
            },
            {
                "item_key": "vip_02",
                "name": "💬 VIP Nexus",
                "description": "Soporte premium y contenido semanal.",
                "price_usd": 25.0,
            },
            {
                "item_key": "vip_03",
                "name": "💬 VIP Zenith",
                "description": "Grupo exclusivo con señales filtradas.",
                "price_usd": 25.0,
            },
            {
                "item_key": "vip_04",
                "name": "💬 VIP Pulse",
                "description": "Comunidad activa con actualizaciones.",
                "price_usd": 25.0,
            },
            {
                "item_key": "vip_05",
                "name": "💬 VIP Prime",
                "description": "Recursos VIP con prioridad alta.",
                "price_usd": 25.0,
            },
            {
                "item_key": "vip_06",
                "name": "💬 VIP Terra",
                "description": "Acceso a contenido y soporte extendido.",
                "price_usd": 25.0,
            },
            {
                "item_key": "vip_07",
                "name": "💬 VIP Sigma",
                "description": "Grupo con resúmenes y plantillas.",
                "price_usd": 25.0,
            },
            {
                "item_key": "vip_08",
                "name": "💬 VIP Stellar",
                "description": "Entradas VIP con seguimiento personalizado.",
                "price_usd": 25.0,
            },
            {
                "item_key": "vip_09",
                "name": "💬 VIP Omega",
                "description": "Acceso total a recursos VIP.",
                "price_usd": 25.0,
            },
        ],
    },
    "programas": {
        "title": "💻 Programas y Web",
        "items": [
            {
                "item_key": "web_01",
                "name": "💻 Pack Landing Pro",
                "description": "Plantillas web listas para usar.",
                "price_usd": 30.0,
            },
            {
                "item_key": "web_02",
                "name": "💻 Script Auto",
                "description": "Automatiza tareas básicas en minutos.",
                "price_usd": 30.0,
            },
            {
                "item_key": "web_03",
                "name": "💻 Toolkit SEO",
                "description": "Recursos para mejorar posicionamiento.",
                "price_usd": 30.0,
            },
            {
                "item_key": "web_04",
                "name": "💻 Panel Web Lite",
                "description": "Panel simple con configuracion rapida.",
                "price_usd": 30.0,
            },
            {
                "item_key": "web_05",
                "name": "💻 Web Starter",
                "description": "Base web para iniciar proyectos.",
                "price_usd": 30.0,
            },
            {
                "item_key": "web_06",
                "name": "💻 Bot Web",
                "description": "Integracion basica con bots.",
                "price_usd": 30.0,
            },
            {
                "item_key": "web_07",
                "name": "💻 Pack UI",
                "description": "Componentes visuales reutilizables.",
                "price_usd": 30.0,
            },
            {
                "item_key": "web_08",
                "name": "💻 Web Plus",
                "description": "Extras para acelerar el despliegue.",
                "price_usd": 30.0,
            },
            {
                "item_key": "web_09",
                "name": "💻 Web Master",
                "description": "Paquete completo para sitios profesionales.",
                "price_usd": 30.0,
            },
        ],
    },
}


class PaymentStates(StatesGroup):
    waiting_photo = State()


def _get_cart(user_id: int) -> Dict[str, Dict[str, Any]]:
    return _CART_BY_USER.setdefault(user_id, {})


def _format_usd(amount: float) -> str:
    return f"{amount:.2f}"


def _build_cart_text(cart_items: Dict[str, Dict[str, Any]]) -> str:
    if not cart_items:
        return "Carrito de Compras\n\nCarrito vacío."

    lines = ["Carrito de Compras", "Tienes Añadido:"]
    total = 0.0
    for idx, item in enumerate(cart_items.values(), start=1):
        name = html.escape(item["name"])
        qty = int(item["qty"])
        price = float(item["price_usd"])
        total += qty * price
        lines.append(f"{idx}. {name} x{qty}")
    lines.append("")
    lines.append(f"Precio Total: <b>${_format_usd(total)} USD</b>")
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


def _build_cart_summary(cart_items: Dict[str, Dict[str, Any]]) -> str:
    if not cart_items:
        return ""
    lines = ["Resumen del carrito:"]
    total = 0.0
    for idx, item in enumerate(cart_items.values(), start=1):
        name = html.escape(item["name"])
        qty = int(item["qty"])
        price = float(item["price_usd"])
        total += qty * price
        lines.append(f"{idx}. {name} x{qty}")
    lines.append(f"Total: ${_format_usd(total)} USD")
    return "\n".join(lines)


def _get_cart_total(cart_items: Dict[str, Dict[str, Any]]) -> float:
    total = 0.0
    for item in cart_items.values():
        total += float(item["price_usd"]) * int(item["qty"])
    return total


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


def get_shop_page(page: int) -> List[str]:
    if 1 <= page <= len(_SHOP_PAGES):
        return _SHOP_PAGES[page - 1]
    return []


def get_category_items(category_key: str) -> List[Dict[str, Any]]:
    catalog = _CATEGORY_CATALOGS.get(category_key, {})
    items = catalog.get("items", [])
    return items if isinstance(items, list) else []


def get_category_title(category_key: str) -> str:
    return _CATEGORY_CATALOGS.get(category_key, {}).get("title", "Categoría")


def format_products(items: List[str], page: int) -> str:
    if not items:
        return "No hay mas productos disponibles."

    lines = [f"Productos Disponibles (Página {page})", ""]
    for idx, item in enumerate(items, start=1):
        lines.append(f"{_NUMBER_EMOJIS[idx - 1]} {item}")
    return "\n".join(lines)


def format_category_products(category_key: str) -> str:
    items = get_category_items(category_key)
    if not items:
        return "No hay mas productos disponibles."
    title = get_category_title(category_key)
    lines = [f"{title} (Página 1)", ""]
    for idx, item in enumerate(items, start=1):
        lines.append(f"{_NUMBER_EMOJIS[idx - 1]} {item['name']}")
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


async def get_default_product_id() -> Optional[str]:
    product_ids = await get_active_product_ids()
    if not product_ids:
        return None
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


async def render_category_page(
    target: Message, user_id: int, category_key: str
) -> None:
    items = get_category_items(category_key)
    if not items:
        await render_main_view(target, user_id, "No hay mas productos disponibles.")
        return
    text = format_category_products(category_key)
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


@router.callback_query(F.data.startswith("category:select:"))
async def handle_category_select(callback: CallbackQuery) -> None:
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
    items = get_category_items(category_key)
    if index < 1 or index > len(items):
        await callback.answer("No se encontro el producto.", show_alert=True)
        return
    item = items[index - 1]
    text = (
        f"{item['name']}\n\n"
        "Descripción:\n"
        f"{item['description']}\n\n"
        f"Precio: **${int(item['price_usd'])} USD**"
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
    items = get_category_items(category_key)
    if index < 1 or index > len(items):
        await callback.answer("No se encontro el producto.", show_alert=True)
        return
    product_id = await get_default_product_id()
    if not product_id:
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
    cart_items = _get_cart(callback.from_user.id)
    items = get_shop_page(page)
    index_text = callback.data.split(":")[-1]
    index = int(index_text)
    if index < 1 or index > len(items):
        await callback.answer("No se encontro el producto.", show_alert=True)
        return
    product_name = items[index - 1]
    product_id = await resolve_product_id(page, index)
    product_key = product_id or f"{page}:{index}"
    entry = cart_items.get(product_key)
    if entry:
        entry["qty"] += 1
    else:
        cart_items[product_key] = {
            "product_id": product_id,
            "name": product_name,
            "price_usd": _DEFAULT_PRODUCT_PRICE_USD,
            "qty": 1,
        }
    await callback.answer("Añadido al carrito.")


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
    items = get_category_items(category_key)
    if index < 1 or index > len(items):
        await callback.answer("No se encontro el producto.", show_alert=True)
        return
    item = items[index - 1]
    cart_items = _get_cart(callback.from_user.id)
    entry = cart_items.get(item["item_key"])
    if entry:
        entry["qty"] += 1
    else:
        cart_items[item["item_key"]] = {
            "product_id": None,
            "name": item["name"],
            "price_usd": item["price_usd"],
            "qty": 1,
        }
    await callback.answer("Añadido al carrito.")


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
    cart_items = _get_cart(callback.from_user.id)
    await render_main_view(
        callback.message,
        callback.from_user.id,
        _build_cart_text(cart_items),
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
    _CART_BY_USER[callback.from_user.id] = {}
    await render_main_view(
        callback.message,
        callback.from_user.id,
        _build_cart_text({}),
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
    cart_items = _get_cart(callback.from_user.id)
    if not cart_items:
        await render_main_view(
            callback.message,
            callback.from_user.id,
            "Tu carrito está vacío.",
        )
        await callback.answer()
        return

    first_item = next(iter(cart_items.values()))
    product_id = first_item.get("product_id")
    if not product_id:
        await render_main_view(
            callback.message,
            callback.from_user.id,
            "No se pudo crear la orden.",
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
        )
        await callback.answer()
        return

    cart_summary = _build_cart_summary(cart_items)
    cart_total = _get_cart_total(cart_items)
    await state.update_data(
        last_order_id=order["id"],
        current_order_id=order["id"],
        current_order_total=cart_total,
        current_order_summary=cart_summary,
    )
    await render_main_view(
        callback.message,
        callback.from_user.id,
        "Elije tu método de pago:",
        reply_markup=build_payment_methods_keyboard(order["id"], 1, 1),
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
