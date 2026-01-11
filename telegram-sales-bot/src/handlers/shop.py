import asyncio
import html
import re
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
from ..services.crypto_rates import usd_to_btc_rate, usd_to_ltc_rate
from ..services.fx import apply_markup, usd_to_cop, usd_to_mxn
from ..services.i18n import t
from ..services.user_locale import get_user_locale
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
    CRYPTO_WALLET_USDT_BSC,
    CRYPTO_WALLET_USDT_TRON,
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


def _build_cart_text(
    cart_items: List[Dict[str, Any]], total_usd: float, locale: str | None = None
) -> str:
    if not cart_items:
        return t(locale, "cart_empty")

    lines = [t(locale, "cart_title"), "", t(locale, "cart_products_title"), ""]
    for idx, item in enumerate(cart_items, start=1):
        name = html.escape(_strip_category_prefix(item["name"]))
        qty = int(item["qty"])
        lines.append(f"{idx}. {name} x{qty}")
    lines.append("")
    lines.append(
        t(locale, "cart_total_label").format(total=_format_usd(total_usd))
    )
    return "\n".join(lines)


def _build_cart_keyboard(locale: str | None = None) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_cart_buy_all"),
                    callback_data="cart:checkout",
                ),
                InlineKeyboardButton(
                    text=t(locale, "btn_cart_clear_all"),
                    callback_data="cart:clear",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_back"),
                    callback_data="shop:page:1",
                ),
                InlineKeyboardButton(
                    text=t(locale, "btn_home"),
                    callback_data="home:show",
                ),
            ],
        ]
    )


def _build_cart_empty_keyboard(locale: str | None = None) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_back"),
                    callback_data="shop:page:1",
                ),
                InlineKeyboardButton(
                    text=t(locale, "btn_home"),
                    callback_data="home:show",
                ),
            ],
        ]
    )


def _build_cart_summary(
    cart_items: List[Dict[str, Any]], total_usd: float, locale: str | None = None
) -> str:
    if not cart_items:
        return ""
    lines = [t(locale, "cart_summary_title"), "", t(locale, "cart_products_title"), ""]
    for idx, item in enumerate(cart_items, start=1):
        name = html.escape(_strip_category_prefix(item["name"]))
        qty = int(item["qty"])
        lines.append(f"{idx}. {name} x{qty}")
    return "\n".join(lines)


def _build_products_only_summary(summary_text: Optional[str]) -> str:
    if not summary_text:
        return ""
    lines: List[str] = []
    for line in str(summary_text).splitlines():
        low = line.lower().strip()
        if not low:
            continue
        if low.startswith("resumen"):
            continue
        if low.startswith("productos en el carrito.") or low.startswith(
            "products in the cart."
        ):
            continue
        if low.startswith("📦"):
            continue
        if low.startswith("total:") or low.startswith("monto:") or low.startswith(
            "amount:"
        ):
            continue
        if low.startswith("💰") or low.startswith("💱"):
            continue
        if "total" in low and ("usd" in low or "$" in low):
            if low.startswith("total"):
                continue
        lines.append(line)
    return "\n".join(lines).strip()


async def _build_payment_instructions(
    method_key: str,
    base_total: Optional[float],
    summary: Optional[str],
    locale: str | None = None,
) -> str:
    total = float(base_total) if base_total is not None else _DEFAULT_PRODUCT_PRICE_USD
    base_total_text = _format_usd(total)
    total_text = base_total_text
    summary_text = _build_products_only_summary(summary)
    include_final_total = True
    instructions: List[str] = []

    if method_key == "nequi":
        instructions.append(t(locale, "payment_nequi_title"))
        instructions.append("")
        if NEQUI_NUMBER:
            instructions.append(
                t(locale, "payment_nequi_number").format(
                    number=html.escape(NEQUI_NUMBER)
                )
            )
        if NEQUI_NAME:
            instructions.append(
                t(locale, "payment_nequi_name").format(
                    name=html.escape(NEQUI_NAME)
                )
            )
        if summary_text:
            instructions.append("")
            instructions.append(t(locale, "payment_products_title"))
            instructions.append("")
            instructions.append(summary_text)
        instructions.append("")
        instructions.append(
            t(locale, "payment_amount_label").format(amount=base_total_text)
        )
        try:
            rate = await usd_to_cop()
            rate = apply_markup(rate, 0.02)
            cop_amount = total * rate
            instructions.append(
                t(locale, "payment_send_label").format(
                    amount=f"{cop_amount:,.0f} COP"
                )
            )
        except Exception as exc:
            print("[FX] Nequi COP error:", repr(exc))
            instructions.append(t(locale, "payment_send_unavailable_cop"))
        instructions.append("")
        instructions.append(t(locale, "payment_after_pay"))
        include_final_total = False
    elif method_key == "binance":
        instructions.append(t(locale, "payment_binance_title"))
        instructions.append("")
        if BINANCE_ID:
            instructions.append(
                t(locale, "payment_binance_id").format(
                    id=html.escape(BINANCE_ID)
                )
            )
        if summary_text:
            instructions.append("")
            instructions.append(t(locale, "payment_products_title"))
            instructions.append("")
            instructions.append(summary_text)
        instructions.append("")
        instructions.append(
            t(locale, "payment_amount_label").format(amount=base_total_text)
        )
        instructions.append("")
        instructions.append(t(locale, "payment_after_pay_short"))
        include_final_total = False
    elif method_key == "crypto":
        instructions.append(t(locale, "crypto_title"))
        if CRYPTO_WALLET_BTC:
            instructions.append(f"Bitcoin: {html.escape(CRYPTO_WALLET_BTC)}")
        if CRYPTO_WALLET_USDT_TRON:
            instructions.append(f"USDT Tron: {html.escape(CRYPTO_WALLET_USDT_TRON)}")
        if CRYPTO_WALLET_USDT_BSC:
            instructions.append(f"USDT BSC: {html.escape(CRYPTO_WALLET_USDT_BSC)}")
        if CRYPTO_WALLET_LTC:
            instructions.append(f"LTC: {html.escape(CRYPTO_WALLET_LTC)}")
    elif method_key == "mp":
        instructions.append(t(locale, "payment_mp_title"))
        instructions.append("")
        if MERCADOPAGO_ACCOUNT:
            clabe = str(MERCADOPAGO_ACCOUNT).replace("CLABE:", "").strip()
            instructions.append(t(locale, "payment_mp_clabe"))
            instructions.append(f"<code>{html.escape(clabe)}</code>")
        if summary_text:
            instructions.append("")
            instructions.append(t(locale, "payment_products_title"))
            instructions.append("")
            instructions.append(summary_text)
        instructions.append("")
        instructions.append(
            t(locale, "payment_amount_label").format(amount=base_total_text)
        )
        try:
            rate = await usd_to_mxn()
            rate = apply_markup(rate, 0.02)
            mxn_amount = total * rate
            instructions.append(
                t(locale, "payment_send_label").format(
                    amount=f"{mxn_amount:,.2f} MXN"
                )
            )
        except Exception as exc:
            print("[FX] MP MXN error:", repr(exc))
            instructions.append(t(locale, "payment_send_unavailable_mxn"))
        instructions.append("")
        instructions.append(t(locale, "payment_after_pay"))
        include_final_total = False
    elif method_key == "paypal":
        instructions.append(t(locale, "payment_paypal_title"))
        instructions.append("")
        if PAYPAL_ACCOUNT:
            instructions.append(
                t(locale, "payment_paypal_account").format(
                    account=html.escape(PAYPAL_ACCOUNT)
                )
            )
        if summary_text:
            instructions.append("")
            instructions.append(t(locale, "payment_products_title"))
            instructions.append("")
            instructions.append(summary_text)
        instructions.append("")
        instructions.append(
            t(locale, "payment_paypal_amount_note").format(amount=base_total_text)
        )
        paypal_total = total * 1.25
        total_text = _format_usd(paypal_total)
        instructions.append(
            t(locale, "payment_send_total_label").format(amount=total_text)
        )
        instructions.append("")
        instructions.append(t(locale, "payment_after_pay_short"))
        include_final_total = False
    else:
        instructions.append(t(locale, "payment_method_default"))

    instructions.append("")
    if summary_text and include_final_total:
        instructions.append(summary_text)
        instructions.append("")
    if include_final_total:
        instructions.append(
            t(locale, "payment_final_total").format(amount=total_text)
        )
        instructions.append(t(locale, "payment_final_note"))
    return "\n".join(instructions)


def build_shop_keyboard(
    page: int, total_pages: int, count: int, locale: str | None = None
) -> InlineKeyboardMarkup:
    rows: List[List[InlineKeyboardButton]] = []

    for idx in range(1, count + 1):
        if (idx - 1) % 3 == 0:
            rows.append([])
        rows[-1].append(
            InlineKeyboardButton(
                text=str(idx),
                callback_data=f"shop:select:{page}:{idx}",
            )
        )

    nav_row: List[InlineKeyboardButton] = []
    if total_pages > 1:
        if page > 1:
            nav_row.append(
                InlineKeyboardButton(text="<<", callback_data=f"shop:page:{page - 1}")
            )
        if page < total_pages:
            nav_row.append(
                InlineKeyboardButton(
                    text=">>", callback_data=f"shop:page:{page + 1}"
                )
            )
        if nav_row:
            rows.append(nav_row)
    rows.append(
        [
            InlineKeyboardButton(text=t(locale, "btn_back"), callback_data="home:show"),
            InlineKeyboardButton(text=t(locale, "btn_home"), callback_data="home:show"),
        ]
    )

    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_product_detail_keyboard(
    page: int, index: int, locale: str | None = None
) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_buy"),
                    callback_data=f"shop:buy:{page}:{index}",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_add_to_cart"),
                    callback_data=f"shop:cart:{page}:{index}",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_go_to_cart"), callback_data="home:cart"
                ),
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_back"),
                    callback_data=f"shop:page:{page}",
                ),
                InlineKeyboardButton(
                    text=t(locale, "btn_home"), callback_data="home:show"
                ),
            ],
        ]
    )


def build_category_keyboard(
    category_key: str, count: int, locale: str | None = None
) -> InlineKeyboardMarkup:
    rows: List[List[InlineKeyboardButton]] = []
    for idx in range(1, count + 1):
        if (idx - 1) % 3 == 0:
            rows.append([])
        rows[-1].append(
            InlineKeyboardButton(
                text=str(idx),
                callback_data=f"category:select:{category_key}:{idx}",
            )
        )
    rows.append(
        [
            InlineKeyboardButton(text=t(locale, "btn_back"), callback_data="home:show"),
            InlineKeyboardButton(text=t(locale, "btn_home"), callback_data="home:show"),
        ]
    )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_category_detail_keyboard(
    category_key: str, index: int, locale: str | None = None
) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_buy"),
                    callback_data=f"category:buy:{category_key}:{index}",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_add_to_cart"),
                    callback_data=f"category:cart:{category_key}:{index}",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_go_to_cart"), callback_data="home:cart"
                ),
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_back"),
                    callback_data=f"category:page:{category_key}",
                ),
                InlineKeyboardButton(
                    text=t(locale, "btn_home"), callback_data="home:show"
                ),
            ],
        ]
    )


def build_detail_back_keyboard(
    page: int, locale: str | None = None
) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_back"), callback_data=f"shop:page:{page}"
                ),
                InlineKeyboardButton(
                    text=t(locale, "btn_home"), callback_data="home:show"
                ),
            ]
        ]
    )


def get_category_title(category_key: str, locale: str | None = None) -> str:
    key_map = {
        "metodos": "category_title_metodos",
        "vip": "category_title_vip",
        "programas": "category_title_programas",
    }
    key = key_map.get(category_key)
    if not key:
        return t(locale, "category_default_title")
    return t(locale, key)


def format_products(
    items: List[Dict[str, Any]], page: int, locale: str | None = None
) -> str:
    if not items:
        return t(locale, "no_more_products")

    lines = [t(locale, "shop_products_page").format(page=page), ""]
    for idx, item in enumerate(items, start=1):
        lines.append(f"{idx}. {item['display_name']}")
        stock_line = _build_stock_line(item)
        if stock_line:
            lines.append(f"   {stock_line}")
    return "\n".join(lines)


def format_category_products(
    category_key: str, items: List[Dict[str, Any]], locale: str | None = None
) -> str:
    if not items:
        return t(locale, "no_more_products")
    title = get_category_title(category_key, locale)
    lines = [t(locale, "category_page_title").format(title=title, page=1), ""]
    for idx, item in enumerate(items, start=1):
        lines.append(f"{idx}. {item['display_name']}")
        stock_line = _build_stock_line(item)
        if stock_line:
            lines.append(f"   {stock_line}")
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
            products.extend(
                [item for item in items if item.get("is_active") is True]
            )
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
        "description": product.get("description") or "",
        "price": float(product.get("price") or _DEFAULT_PRODUCT_PRICE_USD),
        "available_stock": product.get("available_stock"),
        "stock_is_unlimited": product.get("stock_is_unlimited"),
        "show_stock": product.get("show_stock"),
    }


def _format_code_line(product: Dict[str, Any], locale: str | None = None) -> str:
    code = str(product.get("code") or "").strip()
    if not code:
        return ""
    return f"{t(locale, 'product_code_label').format(code=code)}\n\n"


def _build_stock_line(product: Dict[str, Any]) -> str:
    if product.get("show_stock") is not True:
        return ""
    if product.get("stock_is_unlimited") is True:
        return ""
    available = product.get("available_stock")
    if available is None:
        return ""
    try:
        available_int = int(available)
    except (TypeError, ValueError):
        return ""
    return f"📦 Disponibles: {available_int}"


def _format_stock_block(product: Dict[str, Any]) -> str:
    line = _build_stock_line(product)
    if not line:
        return ""
    return f"{line}\n\n"


def _format_description(raw: Optional[str], locale: str | None = None) -> str:
    if not raw:
        return f"⌾ {t(locale, 'description_fallback')}"
    lines: List[str] = []
    for line in str(raw).splitlines():
        clean = line.strip()
        if not clean:
            continue
        clean = re.sub(r"^\s*(⌾+|[•\-\*\u2022◦·]+)\s*", "", clean)
        clean = re.sub(r"^(⌾\s*)+", "", clean).strip()
        if not clean:
            continue
        lines.append(f"⌾ {clean}")
    return "\n".join(lines)


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
    order_id: str, page: int, index: int, locale: str | None = None
) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_method_nequi"),
                    callback_data=f"order:method:{order_id}:{page}:{index}:nequi",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_method_binance"),
                    callback_data=f"order:method:{order_id}:{page}:{index}:binance",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_method_crypto"),
                    callback_data=f"order:method:{order_id}:{page}:{index}:crypto",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_method_mp"),
                    callback_data=f"order:method:{order_id}:{page}:{index}:mp",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_method_paypal"),
                    callback_data=f"order:method:{order_id}:{page}:{index}:paypal",
                )
            ],
        ]
    )


def build_crypto_assets_keyboard(
    order_id: str, page: int, index: int, locale: str | None = None
) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_crypto_btc"),
                    callback_data=f"cryptoasset:btc:{order_id}:{page}:{index}",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_crypto_usdt_tron"),
                    callback_data=f"cryptoasset:usdt_tron:{order_id}:{page}:{index}",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_crypto_usdt_bsc"),
                    callback_data=f"cryptoasset:usdt_bsc:{order_id}:{page}:{index}",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_crypto_ltc"),
                    callback_data=f"cryptoasset:ltc:{order_id}:{page}:{index}",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_back"),
                    callback_data=f"order:methods:{order_id}:{page}:{index}",
                )
            ],
        ]
    )


def build_payment_prompt_keyboard(
    order_id: str, page: int, index: int, locale: str | None = None
) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_paid"),
                    callback_data=f"order:pay:{order_id}",
                ),
                InlineKeyboardButton(
                    text=t(locale, "btn_back"),
                    callback_data=f"order:methods:{order_id}:{page}:{index}",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_home"), callback_data="home:show"
                )
            ],
        ]
    )


async def render_shop_page(
    target: Message, user_id: int, page: int, locale: str | None = None
) -> None:
    catalog = await _get_shop_page_items(page)
    items = catalog["items"]
    total_pages = catalog["total_pages"]

    if not items:
        await render_main_view(target, user_id, t(locale, "no_more_products"))
        return

    text = format_products(items, page, locale)
    await render_main_view(
        target,
        user_id,
        text,
        reply_markup=build_shop_keyboard(page, total_pages, len(items), locale),
    )


async def render_category_page(
    target: Message, user_id: int, category_key: str, locale: str | None = None
) -> None:
    items = await _get_category_items(category_key)
    if not items:
        await render_main_view(target, user_id, t(locale, "no_more_products"))
        return
    text = format_category_products(category_key, items, locale)
    await render_main_view(
        target,
        user_id,
        text,
        reply_markup=build_category_keyboard(category_key, len(items), locale),
    )


@router.message(Command("shop"))
@router.message(F.text == "🛒 Tienda")
async def handle_shop(message: Message) -> None:
    if not message.from_user:
        return
    locale = await get_user_locale(
        api_client, message.from_user.id, message.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        message.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await message.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds)
        )
        return
    await render_shop_page(message, message.from_user.id, 1, locale)


@router.callback_query(F.data.startswith("shop:page:"))
async def handle_shop_page(callback: CallbackQuery) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    page = int(callback.data.split(":")[-1])
    await render_shop_page(callback.message, callback.from_user.id, page, locale)
    await callback.answer()


@router.callback_query(F.data.startswith("category:page:"))
async def handle_category_page(callback: CallbackQuery) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    category_key = callback.data.split(":")[-1]
    await render_category_page(
        callback.message, callback.from_user.id, category_key, locale
    )
    await callback.answer()


@router.callback_query(F.data.startswith("shop:select:"))
async def handle_product_select(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    _, _, page_text, index_text = callback.data.split(":", 3)
    page = int(page_text)
    index = int(index_text)
    catalog = await _get_shop_page_items(page)
    items = catalog["items"]
    if index < 1 or index > len(items):
        await callback.answer(t(locale, "product_not_found"), show_alert=True)
        return

    product = items[index - 1]
    await state.update_data(selected_product_id=product["id"])
    text = (
        f"{product['display_name']}\n\n"
        f"{_format_code_line(product, locale)}"
        f"{t(locale, 'product_description_label')}\n\n"
        f"{_format_description(product['description'], locale)}\n\n"
        f"{_format_stock_block(product)}"
        f"{t(locale, 'product_price_label').format(price=int(product['price']))}"
    )
    keyboard = build_product_detail_keyboard(page, index, locale)
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
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    _, _, category_key, index_text = callback.data.split(":", 3)
    index = int(index_text)
    items = await _get_category_items(category_key)
    if index < 1 or index > len(items):
        await callback.answer(t(locale, "product_not_found"), show_alert=True)
        return
    item = items[index - 1]
    await state.update_data(selected_product_id=item["id"])
    text = (
        f"{item['display_name']}\n\n"
        f"{_format_code_line(item, locale)}"
        f"{t(locale, 'product_description_label')}\n\n"
        f"{_format_description(item['description'], locale)}\n\n"
        f"{_format_stock_block(item)}"
        f"{t(locale, 'product_price_label').format(price=int(item['price']))}"
    )
    keyboard = build_category_detail_keyboard(category_key, index, locale)
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
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    _, _, page_text, index_text = callback.data.split(":", 3)
    page = int(page_text)
    index = int(index_text)
    catalog = await _get_shop_page_items(page)
    items = catalog["items"]
    if index < 1 or index > len(items):
        await callback.answer(t(locale, "product_not_found"), show_alert=True)
        return
    product = items[index - 1]
    if not product.get("id"):
        await render_main_view(
            callback.message,
            callback.from_user.id,
            t(locale, "no_products_available"),
            reply_markup=build_detail_back_keyboard(page, locale),
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
            t(locale, "order_create_failed"),
            reply_markup=build_detail_back_keyboard(page, locale),
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
        t(locale, "payment_choose_method"),
        reply_markup=build_payment_methods_keyboard(order["id"], page, index, locale),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("category:buy:"))
async def handle_category_buy(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    _, _, category_key, index_text = callback.data.split(":", 3)
    index = int(index_text)
    items = await _get_category_items(category_key)
    if index < 1 or index > len(items):
        await callback.answer(t(locale, "product_not_found"), show_alert=True)
        return
    product = items[index - 1]
    if not product.get("id"):
        await render_main_view(
            callback.message,
            callback.from_user.id,
            t(locale, "no_products_available"),
            reply_markup=build_category_detail_keyboard(category_key, index, locale),
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
            t(locale, "order_create_failed"),
            reply_markup=build_category_detail_keyboard(category_key, index, locale),
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
        t(locale, "payment_choose_method"),
        reply_markup=build_payment_methods_keyboard(order["id"], 1, 1, locale),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("shop:cart:"))
async def handle_shop_cart(callback: CallbackQuery) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
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
        await callback.answer(t(locale, "product_not_found"), show_alert=True)
        return
    product = items[index - 1]
    if not product.get("id"):
        await callback.answer(t(locale, "product_not_found"), show_alert=True)
        return
    try:
        result = await api_client.add_to_cart(
            {
                "telegram_id": callback.from_user.id,
                "product_id": product["id"],
                "qty": 1,
                "username": callback.from_user.username,
            }
        )
        if result.get("ok") is False and result.get("error") == "OUT_OF_STOCK":
            backend_msg = result.get("message")
            add_result = backend_msg or t(locale, "add_to_cart_failed")
            if backend_msg:
                await callback.answer(backend_msg, show_alert=True)
        else:
            add_result = t(locale, "add_to_cart_success")
    except httpx.HTTPError:
        add_result = t(locale, "add_to_cart_failed")
    text = (
        f"{product['display_name']}\n\n"
        f"{_format_code_line(product, locale)}"
        f"{t(locale, 'product_description_label')}\n\n"
        f"{_format_description(product['description'], locale)}\n\n"
        f"{_format_stock_block(product)}"
        f"{t(locale, 'product_price_label').format(price=int(product['price']))}\n\n"
        f"{add_result}"
    )
    keyboard = build_product_detail_keyboard(page, index, locale)
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
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    _, _, category_key, index_text = callback.data.split(":", 3)
    index = int(index_text)
    items = await _get_category_items(category_key)
    if index < 1 or index > len(items):
        await callback.answer(t(locale, "product_not_found"), show_alert=True)
        return
    item = items[index - 1]
    if not item.get("id"):
        await callback.answer(t(locale, "product_not_found"), show_alert=True)
        return
    try:
        result = await api_client.add_to_cart(
            {
                "telegram_id": callback.from_user.id,
                "product_id": item["id"],
                "qty": 1,
                "username": callback.from_user.username,
            }
        )
        if result.get("ok") is False and result.get("error") == "OUT_OF_STOCK":
            backend_msg = result.get("message")
            add_result = backend_msg or t(locale, "add_to_cart_failed")
            if backend_msg:
                await callback.answer(backend_msg, show_alert=True)
        else:
            add_result = t(locale, "add_to_cart_success")
    except httpx.HTTPError:
        add_result = t(locale, "add_to_cart_failed")
    text = (
        f"{item['display_name']}\n\n"
        f"{_format_code_line(item, locale)}"
        f"{t(locale, 'product_description_label')}\n\n"
        f"{_format_description(item['description'], locale)}\n\n"
        f"{_format_stock_block(item)}"
        f"{t(locale, 'product_price_label').format(price=int(item['price']))}\n\n"
        f"{add_result}"
    )
    keyboard = build_category_detail_keyboard(category_key, index, locale)
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
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    try:
        cart_data = await api_client.get_cart(callback.from_user.id)
    except httpx.HTTPError:
        await callback.answer(
            t(locale, "cart_load_failed"),
            show_alert=True,
        )
        return
    cart_items = cart_data.get("items", [])
    total_usd = float(cart_data.get("total_usd", 0))
    cart_keyboard = (
        _build_cart_keyboard(locale)
        if cart_items
        else _build_cart_empty_keyboard(locale)
    )
    await render_main_view(
        callback.message,
        callback.from_user.id,
        _build_cart_text(cart_items, total_usd, locale),
        reply_markup=cart_keyboard,
        parse_mode=ParseMode.HTML,
    )
    await callback.answer()


@router.callback_query(F.data == "cart:clear")
async def handle_cart_clear(callback: CallbackQuery) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    await api_client.clear_cart({"telegram_id": callback.from_user.id})
    await render_main_view(
        callback.message,
        callback.from_user.id,
        _build_cart_text([], 0.0, locale),
        reply_markup=_build_cart_empty_keyboard(locale),
        parse_mode=ParseMode.HTML,
    )
    await callback.answer()


@router.callback_query(F.data == "cart:checkout")
async def handle_cart_checkout(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
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
            t(locale, "cart_empty_short"),
        )
        await callback.answer()
        return
    cart_summary = _build_cart_summary(cart_items, cart_total, locale)
    try:
        result = await api_client.checkout_cart(
            {"telegram_id": callback.from_user.id, "username": callback.from_user.username}
        )
    except httpx.HTTPError:
        await render_main_view(
            callback.message,
            callback.from_user.id,
            t(locale, "cart_checkout_error"),
        )
        await callback.answer()
        return

    if result.get("ok") is False and result.get("error") == "OUT_OF_STOCK":
        backend_msg = result.get("message") or t(locale, "cart_checkout_error")
        await render_main_view(
            callback.message,
            callback.from_user.id,
            backend_msg,
        )
        await callback.answer(backend_msg, show_alert=True)
        return

    order_id = result.get("order_id")
    cart_total = float(result.get("total_usd", cart_total))
    if not order_id:
        await render_main_view(
            callback.message,
            callback.from_user.id,
            t(locale, "order_create_failed"),
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
        t(locale, "payment_choose_method"),
        reply_markup=build_payment_methods_keyboard(order_id, 1, 1, locale),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("order:methods:"))
async def handle_order_methods(callback: CallbackQuery) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    _, _, order_id, page_text, index_text = callback.data.split(":", 4)
    page = int(page_text)
    index = int(index_text)
    await render_main_view(
        callback.message,
        callback.from_user.id,
        t(locale, "payment_choose_method"),
        reply_markup=build_payment_methods_keyboard(order_id, page, index, locale),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("order:method:"))
async def handle_order_method(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    _, _, order_id, page_text, index_text, method_key = callback.data.split(":", 5)
    page = int(page_text)
    index = int(index_text)
    if method_key == "crypto":
        await render_main_view(
            callback.message,
            callback.from_user.id,
            t(locale, "payment_choose_crypto"),
            reply_markup=build_crypto_assets_keyboard(order_id, page, index, locale),
        )
        await callback.answer()
        return
    data = await state.get_data()
    total = data.get("current_order_total")
    summary = data.get("current_order_summary")
    text = await _build_payment_instructions(method_key, total, summary, locale)
    await render_main_view(
        callback.message,
        callback.from_user.id,
        text,
        reply_markup=build_payment_prompt_keyboard(order_id, page, index, locale),
        parse_mode=ParseMode.HTML,
    )
    await callback.answer()


@router.callback_query(F.data.startswith("order:create:"))
async def handle_create_order(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
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
            t(locale, "order_create_failed"),
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
        f"{t(locale, 'order_created_title')}\n\n"
        f"{t(locale, 'order_id_label').format(order_id=order['id'])}\n"
        f"{t(locale, 'order_total_label').format(total=order.get('total'))}\n\n"
        f"{t(locale, 'payment_instructions_title')}\n"
        f"{t(locale, 'payment_network_label').format(network=instructions.get('network'))}\n"
        f"{t(locale, 'payment_asset_label').format(asset=instructions.get('asset'))}\n"
        f"{t(locale, 'payment_wallet_label').format(wallet=instructions.get('wallet'))}\n"
        f"{t(locale, 'payment_note_label').format(note=instructions.get('note'))}\n\n"
        f"{t(locale, 'payment_instructions_footer')}"
    )

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_paid"),
                    callback_data=f"order:pay:{order['id']}",
                ),
                InlineKeyboardButton(
                    text=t(locale, "btn_status"),
                    callback_data=f"order:status:{order['id']}",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_back"),
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
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
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
        t(locale, "payment_screenshot_request"),
        reply_markup=filtered_markup,
    )
    await callback.answer()


@router.message(F.photo)
async def handle_payment_photo(message: Message, state: FSMContext) -> None:
    if not message.photo or not message.from_user:
        return
    locale = await get_user_locale(
        api_client, message.from_user.id, message.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        message.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await message.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds)
        )
        return

    data = await state.get_data()
    order_id = data.get("order_id") or data.get("current_order_id")
    if not order_id:
        await message.answer(t(locale, "no_active_order"))
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
                t(locale, "screenshot_received_already")
            )
            await asyncio.sleep(3)
            try:
                await notice.delete()
            except Exception:
                pass
            return
        raise
    _SCREENSHOTS_RECEIVED.add(order_id)
    await message.answer(t(locale, "screenshot_received"))
    await state.update_data(order_id=None)
    await state.set_state(None)


@router.callback_query(F.data.startswith("order:status:"))
async def handle_status_callback(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    order_id = callback.data.split(":")[-1]
    await state.update_data(last_order_id=order_id)
    await send_order_status(
        callback.message, callback.from_user.id, order_id, locale
    )
    await callback.answer()


@router.message(F.text == "📦 Ver estado")
async def handle_status_message(message: Message, state: FSMContext) -> None:
    if not message.from_user:
        return
    locale = await get_user_locale(
        api_client, message.from_user.id, message.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        message.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await message.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds)
        )
        return
    data = await state.get_data()
    order_id = data.get("last_order_id")
    if not order_id:
        await render_main_view(
            message,
            message.from_user.id,
            t(locale, "no_recent_orders"),
        )
        return
    await send_order_status(message, message.from_user.id, order_id, locale)


@router.callback_query(F.data.startswith("cryptoasset:"))
async def handle_crypto_asset(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    set_main_message_id(callback.from_user.id, callback.message.message_id)

    _, asset_key, order_id, page_text, index_text = callback.data.split(":", 4)
    page = int(page_text)
    index = int(index_text)

    data = await state.get_data()
    total = float(data.get("current_order_total") or 0)

    items_text = ""
    summary = data.get("current_order_summary")
    if summary:
        items_text = _build_products_only_summary(summary)
    else:
        try:
            cart = await api_client.get_cart(callback.from_user.id)
            items = cart.get("items", [])
            if items:
                lines = []
                for idx, item in enumerate(items, start=1):
                    name = html.escape(
                        (item.get("name") or t(locale, "item_fallback")).strip()
                    )
                    qty = int(item.get("qty") or 1)
                    lines.append(f"{idx}. {name} x{qty}")
                items_text = "\n".join(lines)
        except Exception:
            items_text = ""

    wallet = ""
    send_str = ""

    if asset_key == "btc":
        wallet = CRYPTO_WALLET_BTC
        try:
            rate = await usd_to_btc_rate()
            send_amount = total * rate
            send_str = f"{send_amount:.8f} BTC"
        except Exception:
            send_str = t(locale, "crypto_send_unavailable_btc")
    elif asset_key == "ltc":
        wallet = CRYPTO_WALLET_LTC
        try:
            rate = await usd_to_ltc_rate()
            send_amount = total * rate
            send_str = f"{send_amount:.8f} LTC"
        except Exception:
            send_str = t(locale, "crypto_send_unavailable_ltc")
    elif asset_key == "usdt_tron":
        wallet = CRYPTO_WALLET_USDT_TRON
        send_str = f"{total:.2f} USDT (TRON)"
    elif asset_key == "usdt_bsc":
        wallet = CRYPTO_WALLET_USDT_BSC
        send_str = f"{total:.2f} USDT (BSC)"
    else:
        send_str = f"{total:.2f} USDT"

    if not wallet:
        wallet = t(locale, "crypto_wallet_not_configured")

    title = {
        "btc": t(locale, "crypto_asset_btc"),
        "usdt_tron": t(locale, "crypto_asset_usdt_tron"),
        "usdt_bsc": t(locale, "crypto_asset_usdt_bsc"),
        "ltc": t(locale, "crypto_asset_ltc"),
    }.get(asset_key, t(locale, "crypto_asset_default"))

    text = (
        f"{title}\n\n"
        f"{t(locale, 'crypto_wallet_label')}\n<code>{html.escape(wallet)}</code>\n\n"
    )

    if items_text:
        text += (
            f"{t(locale, 'payment_products_title')}\n\n{items_text}\n\n"
        )

    text += (
        f"{t(locale, 'payment_amount_total_label').format(amount=f'{total:.2f}')}\n"
        f"{t(locale, 'payment_send_label_bold').format(amount=send_str)}\n\n"
        f"{t(locale, 'payment_after_pay_short')}"
    )

    await render_main_view(
        callback.message,
        callback.from_user.id,
        text,
        reply_markup=build_payment_prompt_keyboard(order_id, page, index, locale),
        parse_mode=ParseMode.HTML,
    )
    await callback.answer()


def format_receipt(order: Dict[str, Any], locale: str | None = None) -> str:
    total = order.get("unit_price_at_purchase")
    paid_at = order.get("paid_at") or order.get("created_at")
    paid_at_text = paid_at
    if isinstance(paid_at, datetime):
        paid_at_text = paid_at.isoformat()

    return (
        f"{t(locale, 'receipt_title')}\n"
        f"{t(locale, 'receipt_order').format(order_id=order['id'])}\n"
        f"{t(locale, 'receipt_product').format(product_id=order.get('product_id'))}\n"
        f"{t(locale, 'receipt_qty').format(qty=1)}\n"
        f"{t(locale, 'receipt_total').format(total=total)}\n"
        f"{t(locale, 'receipt_date').format(date=paid_at_text)}\n"
        f"{t(locale, 'receipt_status')}"
    )


async def send_order_status(
    target: Message, user_id: int, order_id: str, locale: str | None = None
) -> None:
    result = await api_client.get_order(order_id)
    order = result.get("order")

    if not order:
        await render_main_view(
            target,
            user_id,
            t(locale, "order_not_found"),
        )
        return

    status = order.get("status")
    if status == "PAID":
        await render_main_view(target, user_id, format_receipt(order, locale))
    elif status == "WAITING_PAYMENT":
        await render_main_view(target, user_id, t(locale, "status_paid_review"))
    elif status == "CREATED":
        await render_main_view(target, user_id, t(locale, "status_pending_payment"))
    elif status == "CANCELLED":
        await render_main_view(
            target, user_id, t(locale, "status_payment_rejected")
        )
    else:
        await render_main_view(
            target,
            user_id,
            t(locale, "status_current").format(status=status),
        )
