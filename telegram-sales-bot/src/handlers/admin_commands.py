import asyncio
from datetime import datetime
import html
import re
from typing import Any, Dict, Optional

import httpx
from aiogram import F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    BufferedInputFile,
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)

from ..config import (
    ADMIN_API_KEY,
    ADMIN_TELEGRAM_IDS,
    API_BASE_URL,
    API_TOKEN,
    BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    BOT_RATE_LIMIT_ENABLED,
    BOT_RATE_LIMIT_SECONDS,
    BOT_TO_API_SECRET,
    BOT_USERNAME,
)
from ..services.api_client import ApiClient
from ..services.deeplinks import build_bot_start_link, build_product_start_payload
from ..services.home_layout import clear_home_layout_cache
from ..services.i18n import t
from ..services.user_locale import get_user_locale
from ..utils.home_view import render_home_view
from ..utils.rate_limit import check_global_rate_limit

router = Router()
api_client = ApiClient(API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET)


class AdminUiStates(StatesGroup):
    awaiting_value = State()


_PRODUCT_CATEGORY_KEYS = ("TIENDA", "METODOS", "VIP", "PROGRAMAS")
_PRODUCT_CATEGORY_KEY_SET = set(_PRODUCT_CATEGORY_KEYS)
_PRODUCT_CATEGORY_LABELS = {
    "TIENDA": "🛍️ Tienda",
    "METODOS": "💳 Metodos",
    "VIP": "👑 VIP",
    "PROGRAMAS": "🧩 Programas",
}
_PRODUCT_IMAGE_SKIP_WORDS = {
    "skip",
    "saltar",
    "omitir",
    "sin",
    "sin imagen",
    "no",
}

_BROADCAST_SKIP_WORDS = {
    "sin",
    "sin media",
    "sin multimedia",
    "sin imagen",
    "omitir",
    "saltar",
    "skip",
    "none",
    "no",
}

_BROADCAST_EDIT_KEEP_WORDS = {
    "saltar",
    "skip",
    "omitir",
    "mantener",
    "keep",
}

_HOME_LAYOUT_KEY = "home_menu_v1"
_HOME_LAYOUT_LOCALES = ("es", "en")
_HOME_BUTTON_LIMIT = 24

_HOME_DEFAULT_BUTTON_KEYS = [
    ("menu_shop", "shop:page:1"),
    ("menu_methods", "category:page:metodos"),
    ("menu_groups", "category:page:vip"),
    ("menu_programs", "category:page:programas"),
    ("menu_cart", "home:cart"),
    ("menu_affiliates", "home:affiliates"),
    ("menu_community", "home:community"),
    ("menu_support", "home:support"),
    ("menu_language", "home:soon:idioma"),
]


def _is_en(locale: str | None) -> bool:
    return str(locale or "").lower().startswith("en")


def _tr(locale: str | None, es_text: str, en_text: str) -> str:
    return en_text if _is_en(locale) else es_text


_ORDER_STATUS_LABELS = {
    "CREATED": ("Creada", "Created"),
    "WAITING_PAYMENT": ("Esperando pago", "Waiting payment"),
    "PAID": ("Pagada", "Paid"),
    "DELIVERED": ("Entregada", "Delivered"),
    "CANCELLED": ("Cancelada", "Cancelled"),
    "REFUNDED": ("Reembolsada", "Refunded"),
    "EXPIRED": ("Expirada", "Expired"),
}

_PAYMENT_REVIEW_LABELS = {
    "PENDING": ("Pendiente", "Pending"),
    "APPROVED": ("Aprobado", "Approved"),
    "REJECTED": ("Rechazado", "Rejected"),
}

_REFUND_TYPE_LABELS = {
    "FULL": ("Completo", "Full"),
    "PARTIAL": ("Parcial", "Partial"),
}


def _map_enum_label(value: Any, locale: str | None, labels: Dict[str, tuple[str, str]]) -> str:
    key = str(value or "").upper().strip()
    if not key:
        return "-"
    pair = labels.get(key)
    if not pair:
        return str(value)
    return pair[1] if _is_en(locale) else pair[0]


def _order_status_text(value: Any, locale: str | None) -> str:
    return _map_enum_label(value, locale, _ORDER_STATUS_LABELS)


def _payment_review_text(value: Any, locale: str | None) -> str:
    return _map_enum_label(value, locale, _PAYMENT_REVIEW_LABELS)


def _refund_type_text(value: Any, locale: str | None) -> str:
    return _map_enum_label(value, locale, _REFUND_TYPE_LABELS)


def _build_order_not_found_text(payload: Dict[str, Any], locale: str | None) -> str:
    lookup = payload.get("order_lookup") if isinstance(payload, dict) else None
    if not isinstance(lookup, dict):
        return _tr(
            locale,
            "❌ <b>Orden no encontrada.</b>",
            "❌ <b>Order not found.</b>",
        )
    min_label = lookup.get("min_label")
    max_label = lookup.get("max_label")
    requested_label = lookup.get("requested_label")
    total = lookup.get("total")
    if not min_label or not max_label or int(total or 0) <= 0:
        return _tr(
            locale,
            "❌ <b>No hay órdenes disponibles todavía.</b>",
            "❌ <b>There are no available orders yet.</b>",
        )
    if requested_label:
        return _tr(
            locale,
            "❌ <b>Orden no existe.</b>\n\n"
            f"Referencia consultada: <code>{_escape_html(requested_label)}</code>\n"
            "Solo están disponibles las órdenes de "
            f"<code>{_escape_html(min_label)}</code> a <code>{_escape_html(max_label)}</code>.",
            "❌ <b>Order does not exist.</b>\n\n"
            f"Requested reference: <code>{_escape_html(requested_label)}</code>\n"
            "Only orders from "
            f"<code>{_escape_html(min_label)}</code> to <code>{_escape_html(max_label)}</code> are available.",
        )
    return _tr(
        locale,
        "❌ <b>Orden no existe.</b>\n\n"
        "Solo están disponibles las órdenes de "
        f"<code>{_escape_html(min_label)}</code> a <code>{_escape_html(max_label)}</code>.",
        "❌ <b>Order does not exist.</b>\n\n"
        "Only orders from "
        f"<code>{_escape_html(min_label)}</code> to <code>{_escape_html(max_label)}</code> are available.",
    )


def _extract_args(text: str | None) -> str:
    raw = (text or "").strip()
    if not raw:
        return ""
    parts = raw.split(maxsplit=1)
    return parts[1].strip() if len(parts) > 1 else ""


def _safe_int(value: str, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(min(parsed, maximum), minimum)


def _fmt_dt(value: Any) -> str:
    if not value:
        return "-"
    parsed: datetime | None = None
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        raw = value.strip()
        if not raw:
            return "-"
        iso_candidate = raw[:-1] + "+00:00" if raw.endswith("Z") else raw
        try:
            parsed = datetime.fromisoformat(iso_candidate)
        except ValueError:
            pass
        if not parsed:
            match = re.match(r"^(\d{4})-(\d{2})-(\d{2})", raw)
            if match:
                year, month, day = match.groups()
                return f"{day}/{month}/{year}"
            return raw
    if not parsed:
        return str(value)
    return parsed.strftime("%d/%m/%Y")


def _safe_offset(value: Any, default: int = 0, minimum: int = 0, maximum: int = 5200) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(min(parsed, maximum), minimum)


def _format_month_year_label(date_value: Any, locale: str | None = "es") -> str:
    raw = str(date_value or "").strip()
    if not raw:
        return "-"
    iso_candidate = raw[:-1] + "+00:00" if raw.endswith("Z") else raw
    parsed: datetime | None = None
    try:
        parsed = datetime.fromisoformat(iso_candidate)
    except ValueError:
        match = re.match(r"^(\d{4})-(\d{2})", raw)
        if match:
            parsed = datetime(int(match.group(1)), int(match.group(2)), 1)
    if not parsed:
        return _fmt_dt(raw)
    if _is_en(locale):
        return parsed.strftime("%B %Y")
    month_names = [
        "Enero",
        "Febrero",
        "Marzo",
        "Abril",
        "Mayo",
        "Junio",
        "Julio",
        "Agosto",
        "Septiembre",
        "Octubre",
        "Noviembre",
        "Diciembre",
    ]
    return f"{month_names[parsed.month - 1]} del {parsed.year}"


def _format_date_range(start_date: Any, end_date: Any) -> str:
    return f"{_fmt_dt(start_date)} - {_fmt_dt(end_date)}"


def _escape_html(value: Any) -> str:
    return html.escape(str(value if value is not None else "-"))


def _fmt_amount(value: Any, digits: int = 2) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "-"
    return f"{number:,.{digits}f}"


def _normalize_category_key(raw: Any) -> str:
    text = str(raw or "").strip().upper()
    if not text:
        return ""
    text = text.replace("-", "_").replace(" ", "_")
    text = re.sub(r"[^A-Z0-9_]", "", text)
    return text[:32]


def _category_button_label(category_key: str, locale: str | None = "es") -> str:
    normalized = _normalize_category_key(category_key)
    if not normalized:
        return _tr(locale, "📦 Categoría", "📦 Category")
    known = _PRODUCT_CATEGORY_LABELS.get(normalized)
    if known:
        return known
    pretty = normalized.replace("_", " ").title()
    return f"📦 {pretty}"


async def _list_active_product_categories(page_size: int = 100) -> list[str]:
    page = 1
    seen: set[str] = set()
    while True:
        response = await api_client.list_products(
            page=page,
            page_size=page_size,
            telegram_id=None,
        )
        items = response.get("items", [])
        if not items:
            break
        for item in items:
            key = _normalize_category_key(item.get("category_key"))
            if key:
                seen.add(key)
        total_pages = int(response.get("total_pages") or 1)
        if page >= total_pages:
            break
        page += 1

    ordered = [key for key in _PRODUCT_CATEGORY_KEYS if key in seen]
    extras = sorted(key for key in seen if key not in _PRODUCT_CATEGORY_KEY_SET)
    if ordered or extras:
        return ordered + extras
    return list(_PRODUCT_CATEGORY_KEYS)


def _normalize_locale_code(locale: str | None) -> str:
    return "en" if _is_en(locale) else "es"


def _default_home_buttons(locale: str) -> list[Dict[str, str]]:
    normalized = _normalize_locale_code(locale)
    return [
        {"label": t(normalized, label_key), "action": action}
        for label_key, action in _HOME_DEFAULT_BUTTON_KEYS
    ]


def _pair_home_buttons(buttons: list[Dict[str, str]]) -> list[list[Dict[str, str]]]:
    rows: list[list[Dict[str, str]]] = []
    for button in buttons:
        if rows and len(rows[-1]) < 2:
            rows[-1].append(button)
        else:
            rows.append([button])
    return rows


def _default_home_button_rows(locale: str) -> list[list[Dict[str, str]]]:
    return _pair_home_buttons(_default_home_buttons(locale))


def _normalize_home_button(raw: Any) -> Optional[Dict[str, str]]:
    if not isinstance(raw, dict):
        return None
    label = str(raw.get("label") or raw.get("text") or "").strip()
    action = str(raw.get("action") or raw.get("callback_data") or "").strip()
    url = str(raw.get("url") or "").strip()
    if not label:
        return None
    label = label[:64]
    if url:
        return {"label": label, "url": url}
    if not action:
        return None
    return {"label": label, "action": action[:64]}


def _clone_home_button_rows(rows: Any) -> list[list[Dict[str, str]]]:
    cloned: list[list[Dict[str, str]]] = []
    if not isinstance(rows, list):
        return cloned
    flat_mode: list[Dict[str, str]] = []
    for row in rows:
        if isinstance(row, dict):
            parsed = _normalize_home_button(row)
            if parsed:
                flat_mode.append(parsed)
            continue
        if not isinstance(row, list):
            continue
        clean_row: list[Dict[str, str]] = []
        for button in row:
            parsed = _normalize_home_button(button)
            if parsed:
                clean_row.append(parsed)
            if len(clean_row) == 2:
                break
        if clean_row:
            cloned.append(clean_row)
    if not cloned and flat_mode:
        cloned = _pair_home_buttons(flat_mode)
    return cloned


def _trim_home_button_rows(rows: list[list[Dict[str, str]]]) -> list[list[Dict[str, str]]]:
    trimmed: list[list[Dict[str, str]]] = []
    count = 0
    for row in rows:
        if count >= _HOME_BUTTON_LIMIT:
            break
        clean_row: list[Dict[str, str]] = []
        for button in row[:2]:
            if count >= _HOME_BUTTON_LIMIT:
                break
            clean_row.append(button)
            count += 1
        if clean_row:
            trimmed.append(clean_row)
    return trimmed


def _default_home_layout() -> Dict[str, Any]:
    return {
        "es": {
            "text": t("es", "home_welcome"),
            "buttons": _default_home_button_rows("es"),
        },
        "en": {
            "text": t("en", "home_welcome"),
            "buttons": _default_home_button_rows("en"),
        },
    }


def _normalize_home_buttons(raw_buttons: Any, locale: str) -> list[list[Dict[str, str]]]:
    fallback = _default_home_button_rows(locale)
    if not isinstance(raw_buttons, list):
        return fallback

    row_mode: list[list[Dict[str, str]]] = []
    flat_mode: list[Dict[str, str]] = []
    for raw in raw_buttons:
        if isinstance(raw, list):
            row: list[Dict[str, str]] = []
            for nested in raw:
                parsed = _normalize_home_button(nested)
                if parsed:
                    row.append(parsed)
                if len(row) == 2:
                    break
            if row:
                row_mode.append(row)
            continue
        parsed = _normalize_home_button(raw)
        if parsed:
            flat_mode.append(parsed)

    if row_mode:
        for button in flat_mode:
            if row_mode and len(row_mode[-1]) < 2:
                row_mode[-1].append(button)
            else:
                row_mode.append([button])
        normalized_rows = _trim_home_button_rows(row_mode)
        return normalized_rows or fallback

    normalized_rows = _trim_home_button_rows(_pair_home_buttons(flat_mode))
    return normalized_rows or fallback


def _flatten_home_buttons(rows: list[list[Dict[str, str]]]) -> list[Dict[str, str]]:
    flat: list[Dict[str, str]] = []
    for row in rows:
        for button in row:
            flat.append(button)
    return flat


def _find_home_button_slot(
    rows: list[list[Dict[str, str]]], index: int
) -> Optional[tuple[int, int]]:
    current = 0
    for row_index, row in enumerate(rows):
        for col_index, _ in enumerate(row):
            current += 1
            if current == index:
                return row_index, col_index
    return None


def _remove_home_button_by_index(
    rows: list[list[Dict[str, str]]], index: int
) -> tuple[list[list[Dict[str, str]]], Optional[Dict[str, str]]]:
    mutable_rows = _clone_home_button_rows(rows)
    slot = _find_home_button_slot(mutable_rows, index)
    if not slot:
        return mutable_rows, None
    row_index, col_index = slot
    button = mutable_rows[row_index].pop(col_index)
    if not mutable_rows[row_index]:
        mutable_rows.pop(row_index)
    return mutable_rows, button


def _insert_home_button(
    rows: list[list[Dict[str, str]]],
    button: Dict[str, str],
    *,
    row_number: Optional[int] = None,
    position: Optional[int] = None,
    force_solo_row: bool = False,
    overflow_mode: str = "shift",
) -> tuple[list[list[Dict[str, str]]], Optional[str]]:
    mutable_rows = _clone_home_button_rows(rows)
    if force_solo_row:
        target_row = row_number or (len(mutable_rows) + 1)
        target_row = max(1, min(target_row, len(mutable_rows) + 1))
        mutable_rows.insert(target_row - 1, [button])
        return _trim_home_button_rows(mutable_rows), None

    if row_number is None and position is None:
        if mutable_rows and len(mutable_rows[-1]) < 2:
            mutable_rows[-1].append(button)
        else:
            mutable_rows.append([button])
        return _trim_home_button_rows(mutable_rows), None

    mode = str(overflow_mode or "shift").strip().lower()
    if mode != "strict":
        flat = _flatten_home_buttons(mutable_rows)
        target_row = row_number or len(mutable_rows)
        target_row = max(1, min(target_row, len(mutable_rows) + 1))
        if target_row == len(mutable_rows) + 1:
            insert_index = len(flat)
        else:
            row_start = sum(len(row) for row in mutable_rows[: target_row - 1])
            row_len = len(mutable_rows[target_row - 1])
            if position is None:
                insert_index = row_start + row_len
            else:
                target_position = 1 if position <= 1 else 2
                insert_index = row_start + min(target_position - 1, row_len)
        flat.insert(insert_index, button)
        return _trim_home_button_rows(_pair_home_buttons(flat)), None

    target_row = row_number or len(mutable_rows)
    target_row = max(1, min(target_row, len(mutable_rows) + 1))
    if target_row == len(mutable_rows) + 1:
        mutable_rows.append([button])
        return _trim_home_button_rows(mutable_rows), None

    row = mutable_rows[target_row - 1]
    if len(row) >= 2:
        return mutable_rows, "ROW_FULL"
    if position is None:
        row.append(button)
        return _trim_home_button_rows(mutable_rows), None
    target_position = 1 if position <= 1 else 2
    insert_at = min(target_position - 1, len(row))
    row.insert(insert_at, button)
    return _trim_home_button_rows(mutable_rows), None


def _parse_positive_int_or_none(value: str) -> Optional[int]:
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _parse_home_overflow_mode(value: str | None) -> Optional[str]:
    raw = str(value or "").strip().lower()
    if not raw:
        return "shift"
    if raw in {"correr", "shift", "run", "auto"}:
        return "shift"
    if raw in {"estricto", "strict"}:
        return "strict"
    return None


def _normalize_home_layout(layout: Any) -> Dict[str, Any]:
    defaults = _default_home_layout()
    normalized: Dict[str, Any] = {}
    source = layout if isinstance(layout, dict) else {}
    for locale_code in _HOME_LAYOUT_LOCALES:
        fallback = defaults[locale_code]
        locale_payload = source.get(locale_code)
        if not isinstance(locale_payload, dict):
            locale_payload = {}
        text_value = str(locale_payload.get("text") or "").strip()
        normalized[locale_code] = {
            "text": text_value or fallback["text"],
            "buttons": _normalize_home_buttons(locale_payload.get("buttons"), locale_code),
        }
    return normalized


def _home_locale_title(locale_target: str, locale_admin: str | None) -> str:
    return _tr(
        locale_admin,
        "Español" if locale_target == "es" else "Inglés",
        "Spanish" if locale_target == "es" else "English",
    )


def _format_home_buttons_list(buttons: list[Dict[str, str]]) -> str:
    rows = _clone_home_button_rows(buttons)
    lines: list[str] = []
    index = 0
    for row_number, row in enumerate(rows, start=1):
        for col_number, button in enumerate(row, start=1):
            index += 1
            label = _escape_html(button.get("label") or "-")
            action = _escape_html(button.get("action") or f"url:{button.get('url') or ''}")
            lines.append(
                f"{index}. [F{row_number}-P{col_number}] {label} → <code>{action}</code>"
            )
    return "\n".join(lines) if lines else "-"


async def _load_home_layout() -> Dict[str, Any]:
    try:
        response = await api_client.admin_get_layout(_HOME_LAYOUT_KEY)
    except Exception:
        return _default_home_layout()
    return _normalize_home_layout(response.get("layout") if isinstance(response, dict) else None)


async def _save_home_layout(layout: Dict[str, Any]) -> Dict[str, Any]:
    response = await api_client.admin_set_layout(_HOME_LAYOUT_KEY, layout)
    clear_home_layout_cache(_HOME_LAYOUT_KEY)
    return _normalize_home_layout(response.get("layout") if isinstance(response, dict) else None)


def _build_home_locale_keyboard(mode: str, locale: str | None = "es") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=_tr(locale, "🇪🇸 Español", "🇪🇸 Spanish"),
                    callback_data=f"adminui:homecfg:{mode}:es",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "🇺🇸 Inglés", "🇺🇸 English"),
                    callback_data=f"adminui:homecfg:{mode}:en",
                ),
            ],
            [InlineKeyboardButton(text=_tr(locale, "⬅️ Panel", "⬅️ Panel"), callback_data="adminui:home")],
        ]
    )


def _build_home_buttons_ops_keyboard(locale_target: str, locale: str | None = "es") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=_tr(locale, "✏️ Renombrar", "✏️ Rename"),
                    callback_data="adminui:homecfg:btnop:rename",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "➕ Agregar", "➕ Add"),
                    callback_data="adminui:homecfg:btnop:add",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "🗑 Eliminar", "🗑 Delete"),
                    callback_data="adminui:homecfg:btnop:delete",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "📍 Mover", "📍 Move"),
                    callback_data="adminui:homecfg:btnop:move",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "🧱 Fila sola", "🧱 Solo row"),
                    callback_data="adminui:homecfg:btnop:solo",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "♻️ Restaurar", "♻️ Reset"),
                    callback_data=f"adminui:homecfg:btnreset:{locale_target}",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "🔁 Cambiar idioma", "🔁 Change language"),
                    callback_data="adminui:homecfg:buttons",
                ),
            ],
            [InlineKeyboardButton(text=_tr(locale, "⬅️ Panel", "⬅️ Panel"), callback_data="adminui:home")],
        ]
    )


def _build_home_buttons_panel_text(
    layout: Dict[str, Any],
    locale_target: str,
    locale_admin: str | None = "es",
) -> str:
    locale_data = layout.get(locale_target) or {}
    buttons = locale_data.get("buttons") if isinstance(locale_data, dict) else []
    if not isinstance(buttons, list):
        buttons = []
    total_buttons = len(_flatten_home_buttons(_clone_home_button_rows(buttons)))
    title = _home_locale_title(locale_target, locale_admin)
    return _tr(
        locale_admin,
        f"🏠 <b>Botones Home ({title})</b>\n\n"
        f"Total: <b>{total_buttons}</b> / {_HOME_BUTTON_LIMIT}\n\n"
        "Botones actuales:\n"
        f"{_format_home_buttons_list(buttons)}\n\n"
        "Opciones rápidas:\n"
        "• Renombrar: <code>numero | nuevo texto</code>\n"
        "• Agregar: <code>texto | callback_data</code>\n"
        "• Agregar con posición: <code>texto | callback_data | fila | posicion(1-2) | modo(correr|estricto)</code>\n"
        "• Mover: <code>numero | fila | posicion(1-2) | modo(correr|estricto)</code>\n"
        "• Fila sola: <code>numero | fila</code>\n"
        "• Eliminar: <code>numero</code>",
        f"🏠 <b>Home Buttons ({title})</b>\n\n"
        f"Total: <b>{total_buttons}</b> / {_HOME_BUTTON_LIMIT}\n\n"
        "Current buttons:\n"
        f"{_format_home_buttons_list(buttons)}\n\n"
        "Quick formats:\n"
        "• Rename: <code>number | new label</code>\n"
        "• Add: <code>label | callback_data</code>\n"
        "• Add with position: <code>label | callback_data | row | position(1-2) | mode(shift|strict)</code>\n"
        "• Move: <code>number | row | position(1-2) | mode(shift|strict)</code>\n"
        "• Solo row: <code>number | row</code>\n"
        "• Delete: <code>number</code>",
    )


async def _admin_guard(message: Message) -> Optional[str]:
    if not message.from_user:
        return None
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
        return None
    if message.from_user.id not in ADMIN_TELEGRAM_IDS:
        await message.answer(t(locale, "admin_not_authorized"))
        return None
    return locale


def _admin_http_configured() -> bool:
    return bool(API_TOKEN or ADMIN_API_KEY)


def _build_admin_panel_keyboard(locale: str | None = "es") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=_tr(locale, "📋 Pendientes", "📋 Pending"),
                    callback_data="adminui:orders",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "🔎 Ver orden", "🔎 View order"),
                    callback_data="adminui:order",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "✅ Aprobar", "✅ Approve"),
                    callback_data="adminui:approve",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "❌ Rechazar", "❌ Reject"),
                    callback_data="adminui:reject",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "💸 Reembolso", "💸 Refund"),
                    callback_data="adminui:refund",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "🚫 Banear", "🚫 Ban"),
                    callback_data="adminui:ban",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "♻️ Desbanear", "♻️ Unban"),
                    callback_data="adminui:unban",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "🛠 Mantenimiento", "🛠 Maintenance"),
                    callback_data="adminui:maint",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "📣 Difusión", "📣 Broadcast"),
                    callback_data="adminui:broadcast",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "➕ Agregar prod", "➕ Add product"),
                    callback_data="adminui:product:add",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "🗑 Eliminar prod", "🗑 Delete product"),
                    callback_data="adminui:product:delete",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "📝 Home texto", "📝 Home text"),
                    callback_data="adminui:homecfg:text",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "🎛 Home botones", "🎛 Home buttons"),
                    callback_data="adminui:homecfg:buttons",
                ),
            ],
            [
                InlineKeyboardButton(text="📜 Logs", callback_data="adminui:logs"),
                InlineKeyboardButton(
                    text=_tr(locale, "📊 Estado", "📊 Status"),
                    callback_data="adminui:status",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "🏆 Top vendidos", "🏆 Top products"),
                    callback_data="adminui:topsales:0",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "💰 Ganancias", "💰 Earnings"),
                    callback_data="adminui:earnings:0:0",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "🔐 Login", "🔐 Login"),
                    callback_data="admin_panel:login",
                ),
            ],
        ]
    )


def _build_back_to_panel_keyboard(locale: str | None = "es") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=_tr(locale, "⬅️ Panel", "⬅️ Panel"),
                    callback_data="adminui:home",
                )
            ]
        ]
    )


def _build_broadcast_buttons_prompt_text(locale: str | None = "es") -> str:
    return _tr(
        locale,
        "📣 <b>Difusión</b>\n"
        "Paso 2/3 · Botones con link (opcional).\n\n"
        "Formato por línea:\n"
        "<code>Texto botón | https://enlace</code>\n"
        "Misma línea: <code>Botón 1 | https://a.com ; Botón 2 | https://b.com</code>\n\n"
        "Si no quieres botones, escribe <code>sin</code> o usa <b>⏭ Saltar</b>.",
        "📣 <b>Broadcast</b>\n"
        "Step 2/3 · Link buttons (optional).\n\n"
        "One line format:\n"
        "<code>Button text | https://link</code>\n"
        "Same row: <code>Button 1 | https://a.com ; Button 2 | https://b.com</code>\n\n"
        "If you don't want buttons, type <code>none</code> or use <b>⏭ Skip</b>.",
    )


def _build_broadcast_media_prompt_text(locale: str | None = "es") -> str:
    return _tr(
        locale,
        "📣 <b>Difusión</b>\n"
        "Paso 3/3 · Multimedia (opcional).\n\n"
        "Envía una <b>imagen</b>, <b>GIF</b> o <b>video</b>.\n"
        "Si no quieres multimedia, escribe <code>sin</code> o usa <b>⏭ Saltar</b>.",
        "📣 <b>Broadcast</b>\n"
        "Step 3/3 · Media (optional).\n\n"
        "Send an <b>image</b>, <b>GIF</b> or <b>video</b>.\n"
        "If you don't want media, type <code>none</code> or use <b>⏭ Skip</b>.",
    )


def _normalize_broadcast_buttons_state(value: Any) -> list[Dict[str, str]]:
    if not isinstance(value, list):
        return []
    normalized: list[Dict[str, str]] = []
    default_row = 0
    for item in value:
        if not isinstance(item, dict):
            continue
        text = _sanitize_broadcast_button_text(item.get("text") or "")
        url = str(item.get("url") or "").strip()
        if not text or not url:
            continue
        if not (url.startswith("http://") or url.startswith("https://")):
            continue
        row_raw = item.get("row")
        try:
            row = int(row_raw)
        except (TypeError, ValueError):
            row = default_row
        if row < 0:
            row = default_row
        normalized.append({"text": text[:64], "url": url, "row": row})
        default_row += 1
    return normalized


def _sanitize_broadcast_button_text(value: Any) -> str:
    text = str(value or "")
    text = re.sub(r"<tg-emoji\b[^>]*>(.*?)</tg-emoji>", r"\1", text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"</?tg-emoji\b[^>]*>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    return html.unescape(text).strip()


def _normalize_broadcast_message_entities(value: Any) -> list[Dict[str, Any]]:
    if not isinstance(value, list):
        return []
    normalized: list[Dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        entity_type = str(item.get("type") or "").strip()
        try:
            offset = int(item.get("offset"))
            length = int(item.get("length"))
        except (TypeError, ValueError):
            continue
        if not entity_type or offset < 0 or length <= 0:
            continue
        entity: Dict[str, Any] = {
            "type": entity_type,
            "offset": offset,
            "length": length,
        }
        for key in ("url", "language", "custom_emoji_id"):
            value_part = item.get(key)
            if value_part is not None and str(value_part).strip():
                entity[key] = str(value_part).strip()
        normalized.append(entity)
    return normalized


def _build_broadcast_preview_keyboard(
    buttons: list[Dict[str, str]],
    locale: str | None = "es",
) -> InlineKeyboardMarkup:
    grouped: Dict[int, list[InlineKeyboardButton]] = {}
    fallback_row = 0
    for button in buttons:
        text = str(button.get("text") or "").strip()[:64]
        url = str(button.get("url") or "").strip()
        if not text or not url:
            continue
        try:
            row_key = int(button.get("row"))
        except (TypeError, ValueError):
            row_key = fallback_row
        if row_key < 0:
            row_key = fallback_row
        grouped.setdefault(row_key, []).append(InlineKeyboardButton(text=text, url=url))
        fallback_row += 1
    rows: list[list[InlineKeyboardButton]] = []
    for key in sorted(grouped.keys()):
        row_buttons = grouped.get(key) or []
        if row_buttons:
            rows.append(row_buttons[:4])
    rows.append(
        [
            InlineKeyboardButton(
                text=_tr(locale, "Salir", "Exit"),
                callback_data="adminui:broadcast:preview:close",
            )
        ]
    )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _build_broadcast_step_keyboard(
    step: str,
    locale: str | None = "es",
) -> InlineKeyboardMarkup:
    target = "buttons" if step == "buttons" else "media"
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=_tr(locale, "⏭ Saltar", "⏭ Skip"),
                    callback_data=f"adminui:broadcast:skip:{target}",
                )
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "⬅ volver", "⬅ back"),
                    callback_data="adminui:home",
                )
            ],
        ]
    )


def _broadcast_media_label(media_kind: str | None, locale: str | None = "es") -> str:
    media_kind_safe = str(media_kind or "").strip().lower()
    if media_kind_safe == "photo":
        return _tr(locale, "Imagen", "Image")
    if media_kind_safe == "animation":
        return "GIF"
    if media_kind_safe == "video":
        return _tr(locale, "Video", "Video")
    return _tr(locale, "Sin multimedia", "No media")


def _build_progress_bar(percent: int, width: int = 12) -> str:
    safe_percent = max(0, min(100, int(percent)))
    filled = round((safe_percent / 100) * width)
    return f"[{'█' * filled}{'░' * (width - filled)}] {safe_percent}%"


def _build_broadcast_progress_text(
    broadcast_id: str,
    locale: str | None = "es",
    *,
    buttons: Optional[list[Dict[str, str]]] = None,
    media_kind: str | None = None,
    target_count: int = 0,
    sent_count: int = 0,
    failed_count: int = 0,
    percent: int = 0,
    status: str | None = None,
) -> str:
    progress_status = str(status or "").upper().strip()
    status_text = _tr(locale, "Preparando", "Preparing")
    if progress_status == "SENDING":
        status_text = _tr(locale, "Enviando", "Sending")
    elif progress_status == "SENT":
        status_text = _tr(locale, "Completada", "Completed")
    elif progress_status == "FAILED":
        status_text = _tr(locale, "Finalizada", "Finished")
    elif progress_status == "QUEUED":
        status_text = _tr(locale, "En cola", "Queued")
    processed_count = max(sent_count + failed_count, 0)
    pending_count = max(target_count - processed_count, 0) if target_count > 0 else 0
    target_label = str(target_count) if target_count > 0 else "..."
    pending_label = str(pending_count) if target_count > 0 else "..."
    return (
        _tr(locale, "📣 <b>Enviando difusión...</b>\n\n", "📣 <b>Sending broadcast...</b>\n\n")
        + f"🆔 ID: <code>{_escape_html(broadcast_id)}</code>\n"
        + f"📌 {_tr(locale, 'Estado', 'Status')}: <b>{_escape_html(status_text)}</b>\n"
        + f"🔗 {_tr(locale, 'Botones', 'Buttons')}: <b>{len(buttons or [])}</b>\n"
        + f"🖼 {_tr(locale, 'Multimedia', 'Media')}: <b>{_escape_html(_broadcast_media_label(media_kind, locale))}</b>\n"
        + f"🎯 {_tr(locale, 'Objetivo', 'Target')}: <b>{target_label}</b>\n"
        + f"✅ {_tr(locale, 'Enviados', 'Sent')}: <b>{sent_count}</b>\n"
        + f"❌ {_tr(locale, 'Rechazados', 'Rejected')}: <b>{failed_count}</b>\n"
        + f"⏳ {_tr(locale, 'Pendientes', 'Pending')}: <b>{pending_label}</b>\n\n"
        + f"<code>{_build_progress_bar(percent)}</code>"
    )


def _build_broadcast_result_summary_text(
    broadcast_id: str,
    locale: str | None = "es",
    *,
    buttons: Optional[list[Dict[str, str]]] = None,
    media_kind: str | None = None,
    target_count: int = 0,
    sent_count: int = 0,
    failed_count: int = 0,
    final_status: str | None = None,
) -> str:
    status_key = str(final_status or "").upper().strip()
    title = _tr(
        locale,
        "📣 <b>Difusiones enviadas Exitosamente</b>\n\n",
        "📣 <b>Broadcasts sent successfully</b>\n\n",
    )
    if status_key == "FAILED" and sent_count == 0:
        title = _tr(
            locale,
            "⚠️ <b>La difusión terminó sin envíos exitosos</b>\n\n",
            "⚠️ <b>The broadcast finished without successful deliveries</b>\n\n",
        )
    return (
        title
        + f"🆔 ID: <code>{_escape_html(broadcast_id)}</code>\n"
        + f"🔗 {_tr(locale, 'Botones', 'Buttons')}: <b>{len(buttons or [])}</b>\n"
        + f"🖼 {_tr(locale, 'Multimedia', 'Media')}: <b>{_escape_html(_broadcast_media_label(media_kind, locale))}</b>\n"
        + f"🎯 {_tr(locale, 'Objetivo', 'Target')}: <b>{target_count}</b>\n"
        + f"✅ {_tr(locale, 'Enviados', 'Sent')}: <b>{sent_count}</b>\n"
        + f"❌ {_tr(locale, 'Rechazados', 'Rejected')}: <b>{failed_count}</b>"
    )


async def _wait_broadcast_progress_and_build_result(
    panel_message: Message,
    broadcast_id: str,
    locale: str | None = "es",
    *,
    buttons: Optional[list[Dict[str, str]]] = None,
    media_kind: str | None = None,
) -> str:
    warmup_steps = (3, 7, 12, 18, 25, 33, 42, 50)
    warmup_index = 0
    last_progress_text = ""
    progress_status = "QUEUED"
    target_count = 0
    sent_count = 0
    failed_count = 0

    while True:
        progress_res = await api_client.admin_get_broadcast_progress(broadcast_id)
        progress = progress_res.get("progress") or {}
        progress_status = str(progress.get("status") or progress_status).upper().strip()
        target_count = _safe_int(progress.get("target_count"), target_count, 0, 10**9)
        sent_count = _safe_int(progress.get("sent_count"), sent_count, 0, 10**9)
        failed_count = _safe_int(progress.get("failed_count"), failed_count, 0, 10**9)
        if target_count > 0:
            percent = _safe_int(progress.get("percent"), 0, 0, 100)
        else:
            percent = warmup_steps[warmup_index]
            if warmup_index < len(warmup_steps) - 1:
                warmup_index += 1
        progress_text = _build_broadcast_progress_text(
            broadcast_id,
            locale,
            buttons=buttons,
            media_kind=media_kind,
            target_count=target_count,
            sent_count=sent_count,
            failed_count=failed_count,
            percent=percent,
            status=progress_status,
        )
        if progress_text != last_progress_text:
            await _edit_panel_message(panel_message, progress_text)
            last_progress_text = progress_text
        if bool(progress.get("is_done")) or progress_status in {"SENT", "FAILED"}:
            break
        await asyncio.sleep(0.2)

    return _build_broadcast_result_summary_text(
        broadcast_id,
        locale,
        buttons=buttons,
        media_kind=media_kind,
        target_count=target_count,
        sent_count=sent_count,
        failed_count=failed_count,
        final_status=progress_status,
    )


async def _send_broadcast_with_progress(
    panel_message: Message,
    text: str,
    locale: str | None = "es",
    *,
    buttons: Optional[list[Dict[str, str]]] = None,
    media_file_id: str | None = None,
    media_kind: str | None = None,
    message_entities: Optional[list[Dict[str, Any]]] = None,
) -> str:
    create_res = await api_client.admin_create_broadcast(
        text,
        segment="ALL_USERS",
        buttons=buttons or [],
        media_file_id=media_file_id,
        media_kind=media_kind,
        message_entities=_normalize_broadcast_message_entities(message_entities),
    )
    broadcast = create_res.get("broadcast", {})
    broadcast_id = str(broadcast.get("id") or "").strip()
    if not broadcast_id:
        return _tr(
            locale,
            "❌ <b>No se pudo crear la difusión.</b>",
            "❌ <b>Could not create the broadcast.</b>",
        )

    await api_client.admin_send_broadcast_async(broadcast_id)
    return await _wait_broadcast_progress_and_build_result(
        panel_message,
        broadcast_id,
        locale,
        buttons=buttons,
        media_kind=media_kind,
    )


def _build_broadcast_review_text(
    text: str,
    buttons: list[Dict[str, str]],
    media_kind: str | None,
    locale: str | None = "es",
) -> str:
    return (
        _tr(
            locale,
            "✅ <b>Difusión lista para enviar</b>\n\n",
            "✅ <b>Broadcast ready to send</b>\n\n",
        )
        + f"📝 {_tr(locale, 'Texto', 'Text')}: <b>{_tr(locale, 'configurado', 'configured')}</b>\n"
        f"🔗 {_tr(locale, 'Botones', 'Buttons')}: <b>{len(buttons)}</b>\n"
        f"🖼 {_tr(locale, 'Multimedia', 'Media')}: <b>{_escape_html(_broadcast_media_label(media_kind, locale))}</b>\n\n"
        + _tr(
            locale,
            "Usa los botones para <b>ver previa</b>, <b>editar</b> o <b>enviar</b>.",
            "Use the buttons to <b>preview</b>, <b>edit</b> or <b>send</b>.",
        )
    )


def _build_broadcast_review_keyboard(locale: str | None = "es") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=_tr(locale, "👁 Ver previa", "👁 Preview"),
                    callback_data="adminui:broadcast:review:preview",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "🟢 Enviar", "🟢 Send"),
                    callback_data="adminui:broadcast:review:send",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "✏️ Editar texto", "✏️ Edit text"),
                    callback_data="adminui:broadcast:review:edit:text",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "🔗 Editar botones", "🔗 Edit buttons"),
                    callback_data="adminui:broadcast:review:edit:buttons",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "🖼 Editar multimedia", "🖼 Edit media"),
                    callback_data="adminui:broadcast:review:edit:media",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "💾 Guardar", "💾 Save"),
                    callback_data="adminui:broadcast:review:save",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "⬅ volver", "⬅ back"),
                    callback_data="adminui:home",
                )
            ],
        ]
    )


def _build_broadcast_menu_text(locale: str | None = "es") -> str:
    return _tr(
        locale,
        "📣 <b>Menú de Difusiones</b>\n\nSelecciona si quieres crear una nueva difusión o abrir una guardada.",
        "📣 <b>Broadcast Menu</b>\n\nChoose whether you want to create a new broadcast or open a saved one.",
    )


def _build_broadcast_menu_keyboard(locale: str | None = "es") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=_tr(locale, "➕ Crear Difusión", "➕ Create Broadcast"),
                    callback_data="adminui:broadcast:new",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "💾 Guardadas", "💾 Saved"),
                    callback_data="adminui:broadcast:saved",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "⬅ volver", "⬅ back"),
                    callback_data="adminui:home",
                ),
            ],
        ]
    )


def _broadcast_preview_snippet(text: str, limit: int = 44) -> str:
    raw = re.sub(r"<[^>]+>", "", str(text or ""))
    raw = " ".join(raw.split()).strip()
    if len(raw) <= limit:
        return raw or "-"
    return f"{raw[:limit - 1]}…"


def _extract_saved_broadcast_media(
    broadcast: Dict[str, Any],
) -> tuple[str | None, str | None]:
    image_path = str(broadcast.get("image_path") or "").strip()
    image_mime = str(broadcast.get("image_mime") or "").strip().lower()
    if image_path.startswith("tgfile:"):
        file_id = image_path[len("tgfile:"):].strip()
        media_kind = ""
        if image_mime.startswith("tg:"):
            media_kind = image_mime[3:].strip().lower()
        if media_kind not in {"photo", "animation", "video"}:
            media_kind = "photo"
        return (file_id or None), media_kind
    return None, None


def _saved_broadcast_media_kind(broadcast: Dict[str, Any]) -> str | None:
    media_file_id, media_kind = _extract_saved_broadcast_media(broadcast)
    if media_file_id and media_kind:
        return media_kind
    image_mime = str(broadcast.get("image_mime") or "").strip().lower()
    if image_mime == "image/gif" or image_mime == "tg:animation":
        return "animation"
    if image_mime.startswith("video/") or image_mime == "tg:video":
        return "video"
    if broadcast.get("image_path"):
        return "photo"
    return None


def _build_broadcast_state_signature(
    text: str,
    entities: Optional[list[Dict[str, Any]]],
    buttons: list[Dict[str, str]],
    media_file_id: str,
    media_kind: str,
) -> str:
    normalized_buttons = [
        {
            "text": str(button.get("text") or "").strip(),
            "url": str(button.get("url") or "").strip(),
            "row": int(button.get("row") or 1),
        }
        for button in buttons
    ]
    normalized_buttons.sort(key=lambda item: (item["row"], item["text"], item["url"]))
    payload = {
        "text": str(text or "").strip(),
        "entities": _normalize_broadcast_message_entities(entities),
        "buttons": normalized_buttons,
        "media_file_id": str(media_file_id or "").strip(),
        "media_kind": str(media_kind or "").strip().lower(),
    }
    return repr(payload)


async def _build_saved_broadcasts_view(
    locale: str | None = "es",
    page: int = 1,
) -> tuple[str, InlineKeyboardMarkup, list[str]]:
    response = await api_client.admin_list_broadcasts(page=1, page_size=50)
    items = response.get("items", []) or []
    saved_items_all = [
        item for item in items
        if bool(item.get("saved"))
    ]
    total_items = len(saved_items_all)
    total_pages = max((total_items + 4) // 5, 1)
    current_page = max(1, min(page, total_pages))
    start_index = (current_page - 1) * 5
    saved_items = saved_items_all[start_index:start_index + 5]
    if not saved_items:
        text = _tr(
            locale,
            "💾 <b>Difusiones guardadas</b>\n\nNo hay difusiones guardadas todavía.",
            "💾 <b>Saved broadcasts</b>\n\nThere are no saved broadcasts yet.",
        )
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text=_tr(locale, "⬅ volver", "⬅ back"),
                        callback_data="adminui:broadcast",
                    )
                ]
            ]
        )
        return text, keyboard, []

    lines = [
        _tr(locale, "💾 <b>Difusiones guardadas</b>", "💾 <b>Saved broadcasts</b>"),
        f"{_tr(locale, 'Página', 'Page')}: <b>{current_page}/{total_pages}</b>",
        "",
    ]
    rows: list[list[InlineKeyboardButton]] = []
    current_row: list[InlineKeyboardButton] = []
    saved_ids: list[str] = []
    for index, item in enumerate(saved_items, start=1):
        broadcast_id = str(item.get("id") or "").strip()
        if not broadcast_id:
            continue
        saved_ids.append(broadcast_id)
        snippet = _escape_html(_broadcast_preview_snippet(item.get("message_text") or ""))
        buttons_count = len(item.get("buttons") or [])
        media_kind = _saved_broadcast_media_kind(item)
        lines.append(
            f"{index}. <b>{snippet}</b>\n"
            f"   🖼 {_escape_html(_broadcast_media_label(media_kind, locale))} | "
            f"🔗 {buttons_count} | "
            f"🗓 {_fmt_dt(item.get('created_at'))}"
        )
        current_row.append(
            InlineKeyboardButton(
                text=f"{index}",
                callback_data=f"adminui:broadcast:saved:pick:{index}",
            )
        )
        if len(current_row) == 3:
            rows.append(current_row)
            current_row = []
    if current_row:
        rows.append(current_row)
    nav_row: list[InlineKeyboardButton] = []
    if current_page > 1:
        nav_row.append(
            InlineKeyboardButton(
                text=_tr(locale, "⬅ volver", "⬅ back"),
                callback_data=f"adminui:broadcast:saved:page:{current_page - 1}",
            )
        )
    if current_page < total_pages:
        nav_row.append(
            InlineKeyboardButton(
                text=_tr(locale, "Siguiente ➡", "Next ➡"),
                callback_data=f"adminui:broadcast:saved:page:{current_page + 1}",
            )
        )
    if nav_row:
        rows.append(nav_row)
    rows.append(
        [
            InlineKeyboardButton(
                text=_tr(locale, "🔄 Recargar", "🔄 Refresh"),
                callback_data="adminui:broadcast:saved",
            ),
            InlineKeyboardButton(
                text=_tr(locale, "⬅ volver", "⬅ back"),
                callback_data="adminui:broadcast",
            ),
        ]
    )
    return "\n\n".join(lines), InlineKeyboardMarkup(inline_keyboard=rows), saved_ids


def _build_saved_broadcast_actions_keyboard(locale: str | None = "es") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=_tr(locale, "👁 Ver previa", "👁 Preview"),
                    callback_data="adminui:broadcast:saved:preview",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "🟢 Enviar", "🟢 Send"),
                    callback_data="adminui:broadcast:saved:send",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "✏️ Editar texto", "✏️ Edit text"),
                    callback_data="adminui:broadcast:saved:edit:text",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "🔗 Editar botones", "🔗 Edit buttons"),
                    callback_data="adminui:broadcast:saved:edit:buttons",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "🖼 Editar multimedia", "🖼 Edit media"),
                    callback_data="adminui:broadcast:saved:edit:media",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "🗑 Eliminar", "🗑 Delete"),
                    callback_data="adminui:broadcast:saved:delete",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "⬅ volver", "⬅ back"),
                    callback_data="adminui:broadcast:saved",
                )
            ],
        ]
    )


def _build_saved_broadcast_detail_text(
    broadcast: Dict[str, Any],
    locale: str | None = "es",
) -> str:
    broadcast_id = _escape_html(broadcast.get("id") or "-")
    snippet = _escape_html(_broadcast_preview_snippet(broadcast.get("message_text") or "", 80))
    buttons_count = len(broadcast.get("buttons") or [])
    media_kind = _saved_broadcast_media_kind(broadcast)
    return (
        _tr(locale, "💾 <b>Difusión guardada</b>\n\n", "💾 <b>Saved broadcast</b>\n\n")
        + f"🆔 ID: <code>{broadcast_id}</code>\n"
        + f"📝 {_tr(locale, 'Texto', 'Text')}: <b>{snippet}</b>\n"
        + f"🔗 {_tr(locale, 'Botones', 'Buttons')}: <b>{buttons_count}</b>\n"
        + f"🖼 {_tr(locale, 'Multimedia', 'Media')}: <b>{_escape_html(_broadcast_media_label(media_kind, locale))}</b>\n"
        + f"🗓 {_tr(locale, 'Creada', 'Created')}: {_fmt_dt(broadcast.get('created_at'))}\n\n"
        + _tr(
            locale,
            "Puedes ver la previa o enviarla directamente.",
            "You can preview it or send it directly.",
        )
    )


async def _send_broadcast_preview_message(
    message: Message,
    text: str,
    buttons: list[Dict[str, str]],
    media_file_id: str | None,
    media_kind: str | None,
    message_entities: Optional[list[Dict[str, Any]]] = None,
    locale: str | None = "es",
) -> None:
    preview_markup = _build_broadcast_preview_keyboard(buttons, locale)
    media_kind_safe = str(media_kind or "").strip().lower()
    media_id = str(media_file_id or "").strip()
    text_value = text.strip()
    caption = text_value[:900] if text_value else ""
    normalized_entities = _normalize_broadcast_message_entities(message_entities)
    can_use_entities = bool(normalized_entities)
    can_use_caption_entities = can_use_entities and len(text_value) <= 1024

    try:
        if media_id:
            media_kwargs: Dict[str, Any] = {
                "caption": (text_value if can_use_caption_entities else caption) or None,
                "reply_markup": preview_markup,
            }
            if can_use_caption_entities:
                media_kwargs["caption_entities"] = normalized_entities
            else:
                media_kwargs["parse_mode"] = "HTML"
            if media_kind_safe == "video":
                await message.answer_video(
                    video=media_id,
                    **media_kwargs,
                )
                return
            if media_kind_safe == "animation":
                await message.answer_animation(
                    animation=media_id,
                    **media_kwargs,
                )
                return
            await message.answer_photo(
                photo=media_id,
                **media_kwargs,
            )
            return

        message_kwargs: Dict[str, Any] = {"reply_markup": preview_markup}
        if can_use_entities:
            message_kwargs["entities"] = normalized_entities
        else:
            message_kwargs["parse_mode"] = "HTML"
        await message.answer(text_value, **message_kwargs)
    except TelegramBadRequest:
        if media_id:
            if media_kind_safe == "video":
                await message.answer_video(
                    video=media_id,
                    caption=caption or None,
                    reply_markup=preview_markup,
                )
                return
            if media_kind_safe == "animation":
                await message.answer_animation(
                    animation=media_id,
                    caption=caption or None,
                    reply_markup=preview_markup,
                )
                return
            await message.answer_photo(
                photo=media_id,
                caption=caption or None,
                reply_markup=preview_markup,
            )
            return
        await message.answer(
            text_value,
            reply_markup=preview_markup,
        )


async def _save_current_broadcast_draft(
    state: FSMContext,
    locale: str | None = "es",
) -> str:
    data = await state.get_data()
    message_text = str(
        data.get("admin_ui_broadcast_plain_text") or data.get("admin_ui_broadcast_text") or ""
    ).strip()
    message_entities = _normalize_broadcast_message_entities(data.get("admin_ui_broadcast_entities"))
    buttons = _normalize_broadcast_buttons_state(data.get("admin_ui_broadcast_buttons"))
    media_file_id = str(data.get("admin_ui_broadcast_media_file_id") or "").strip()
    media_kind = str(data.get("admin_ui_broadcast_media_kind") or "").strip().lower()
    selected_broadcast_id = str(data.get("admin_ui_selected_saved_broadcast_id") or "").strip()
    current_signature = _build_broadcast_state_signature(
        message_text,
        message_entities,
        buttons,
        media_file_id,
        media_kind,
    )
    saved_signature = str(data.get("admin_ui_saved_broadcast_signature") or "").strip()

    if not message_text and not media_file_id:
        return _tr(
            locale,
            "❌ <b>No hay contenido para guardar.</b>",
            "❌ <b>There is no content to save.</b>",
        )

    if selected_broadcast_id and current_signature == saved_signature:
        return _tr(
            locale,
            "ℹ️ <b>Esta difusión ya estaba guardada y no tiene cambios.</b>",
            "ℹ️ <b>This broadcast was already saved and has no changes.</b>",
        )

    payload: Dict[str, Any] = {
        "message": message_text,
        "message_entities": message_entities,
        "buttons": buttons,
        "saved": True,
        "clear_image": not bool(media_file_id),
    }
    if media_file_id:
        payload["media_file_id"] = media_file_id
        payload["media_kind"] = media_kind

    broadcast_id = selected_broadcast_id
    if broadcast_id:
        update_res = await api_client.admin_update_broadcast(broadcast_id, payload)
        broadcast = update_res.get("broadcast", {})
        broadcast_id = str(broadcast.get("id") or "").strip()
    else:
        create_res = await api_client.admin_create_broadcast(
            message_text,
            segment="ALL_USERS",
            buttons=buttons,
            media_file_id=media_file_id or None,
            media_kind=media_kind or None,
            message_entities=message_entities,
        )
        broadcast = create_res.get("broadcast", {})
        broadcast_id = str(broadcast.get("id") or "").strip()
        if broadcast_id:
            update_res = await api_client.admin_update_broadcast(broadcast_id, payload)
            broadcast = update_res.get("broadcast", {}) or broadcast
            broadcast_id = str(broadcast.get("id") or "").strip()

    if not broadcast_id:
        return _tr(
            locale,
            "❌ <b>No se pudo guardar la difusión.</b>",
            "❌ <b>Could not save the broadcast.</b>",
        )

    await state.update_data(
        admin_ui_selected_saved_broadcast_id=broadcast_id,
        admin_ui_saved_broadcast_signature=current_signature,
    )
    return _tr(
        locale,
        "💾 <b>Difusión guardada correctamente.</b>\n\n"
        f"🆔 ID: <code>{_escape_html(broadcast_id)}</code>",
        "💾 <b>Broadcast saved successfully.</b>\n\n"
        f"🆔 ID: <code>{_escape_html(broadcast_id)}</code>",
    )


async def _load_saved_broadcast_for_state(
    state: FSMContext,
    broadcast_id: str,
) -> Dict[str, Any]:
    response = await api_client.admin_get_broadcast(broadcast_id)
    broadcast = response.get("broadcast", {}) or {}
    buttons = _normalize_broadcast_buttons_state(broadcast.get("buttons"))
    media_file_id, media_kind = _extract_saved_broadcast_media(broadcast)
    message_text = str(broadcast.get("message_text") or "").strip()
    message_entities = _normalize_broadcast_message_entities(broadcast.get("message_entities"))
    await state.update_data(
        admin_ui_broadcast_text=message_text,
        admin_ui_broadcast_plain_text=message_text,
        admin_ui_broadcast_entities=message_entities,
        admin_ui_broadcast_buttons=buttons,
        admin_ui_broadcast_media_file_id=media_file_id or "",
        admin_ui_broadcast_media_kind=media_kind or "",
        admin_ui_selected_saved_broadcast_id=broadcast_id,
        admin_ui_saved_broadcast_signature=_build_broadcast_state_signature(
            message_text,
            message_entities,
            buttons,
            media_file_id or "",
            media_kind or "",
        ),
        admin_ui_saved_broadcast=broadcast,
    )
    return broadcast


def _extract_message_html_text(message: Message) -> str:
    html_text = getattr(message, "html_text", None)
    if isinstance(html_text, str) and html_text.strip():
        return html_text.strip()
    caption_html = getattr(message, "caption_html", None)
    if isinstance(caption_html, str) and caption_html.strip():
        return caption_html.strip()
    return (message.text or message.caption or "").strip()


def _extract_message_entities(message: Message) -> list[Dict[str, Any]]:
    raw_entities = message.caption_entities if message.caption is not None else message.entities
    if not raw_entities:
        return []
    serialized: list[Dict[str, Any]] = []
    for entity in raw_entities:
        entity_type = str(getattr(entity, "type", "") or "").strip()
        offset = getattr(entity, "offset", None)
        length = getattr(entity, "length", None)
        if not entity_type or offset is None or length is None:
            continue
        try:
            normalized_offset = int(offset)
            normalized_length = int(length)
        except (TypeError, ValueError):
            continue
        if normalized_offset < 0 or normalized_length <= 0:
            continue
        item: Dict[str, Any] = {
            "type": entity_type,
            "offset": normalized_offset,
            "length": normalized_length,
        }
        for key in ("url", "language", "custom_emoji_id"):
            value = getattr(entity, key, None)
            if value is not None and str(value).strip():
                item[key] = str(value).strip()
        serialized.append(item)
    return serialized


async def _build_delete_categories_keyboard(locale: str | None = "es") -> InlineKeyboardMarkup:
    category_keys = await _list_active_product_categories()
    rows: list[list[InlineKeyboardButton]] = []
    current_row: list[InlineKeyboardButton] = []
    for category_key in category_keys:
        current_row.append(
            InlineKeyboardButton(
                text=_category_button_label(category_key, locale),
                callback_data=f"adminui:product:delete:cat:{category_key}",
            )
        )
        if len(current_row) == 2:
            rows.append(current_row)
            current_row = []
    if current_row:
        rows.append(current_row)
    rows.append(
        [
            InlineKeyboardButton(
                text=_tr(locale, "⬅️ Panel", "⬅️ Panel"),
                callback_data="adminui:home",
            ),
        ]
    )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _build_delete_products_keyboard(
    items: list[Dict[str, Any]],
    category_key: str,
    locale: str | None = "es",
) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    current_row: list[InlineKeyboardButton] = []
    for index, item in enumerate(items, start=1):
        product_id = str(item.get("id") or "").strip()
        if not product_id:
            continue
        current_row.append(
            InlineKeyboardButton(
                text=str(index),
                callback_data=f"adminui:product:delete:item:{product_id}",
            )
        )
        if len(current_row) == 5:
            rows.append(current_row)
            current_row = []
    if current_row:
        rows.append(current_row)
    rows.append(
        [
            InlineKeyboardButton(
                text=_tr(locale, "🔄 Refrescar", "🔄 Refresh"),
                callback_data=f"adminui:product:delete:cat:{category_key}",
            ),
            InlineKeyboardButton(
                text=_tr(locale, "↩️ Categorías", "↩️ Categories"),
                callback_data="adminui:product:delete",
            ),
            InlineKeyboardButton(
                text=_tr(locale, "⬅️ Panel", "⬅️ Panel"),
                callback_data="adminui:home",
            ),
        ]
    )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _build_delete_confirm_keyboard(
    locale: str | None = "es",
) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=_tr(locale, "✅ Sí", "✅ Yes"),
                    callback_data="adminui:product:delete:confirm",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "❌ No", "❌ No"),
                    callback_data="adminui:product:delete:cancel",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "⬅️ Panel", "⬅️ Panel"),
                    callback_data="adminui:home",
                )
            ],
        ]
    )


def _build_admin_panel_text(locale: str | None = "es") -> str:
    return _tr(
        locale,
        "📱 <b>Panel Admin del Bot</b> 🤖\n\n"
        "Selecciona una acción desde los botones.\n\n"
        "📌 Todo el flujo está guiado paso a paso.\n"
        "🛑 Puedes cancelar en cualquier momento con /cancel.",
        "📱 <b>Bot Admin Panel</b> 🤖\n\n"
        "Choose an action from the buttons.\n\n"
        "📌 The full flow is guided step by step.\n"
        "🛑 You can cancel anytime with /cancel.",
    )


def _build_orders_limit_keyboard(locale: str | None = "es") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="5", callback_data="adminui:orders:list:5"),
                InlineKeyboardButton(text="10", callback_data="adminui:orders:list:10"),
                InlineKeyboardButton(text="20", callback_data="adminui:orders:list:20"),
            ],
            [
                InlineKeyboardButton(text="30", callback_data="adminui:orders:list:30"),
                InlineKeyboardButton(
                    text=_tr(locale, "⬅️ Panel", "⬅️ Panel"),
                    callback_data="adminui:home",
                ),
            ],
        ]
    )


def _build_maint_keyboard(locale: str | None = "es") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=f"🟢 {_tr(locale, 'ACTIVO', 'ON')}",
                    callback_data="adminui:maint:set:on",
                ),
                InlineKeyboardButton(
                    text=f"🔴 {_tr(locale, 'INACTIVO', 'OFF')}",
                    callback_data="adminui:maint:set:off",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "⬅️ Panel", "⬅️ Panel"),
                    callback_data="adminui:home",
                ),
            ]
        ]
    )


def _build_logs_keyboard(locale: str | None = "es") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=_tr(locale, "Pagos 10", "Payments 10"),
                    callback_data="adminui:logs:list:payments:10",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "Errores 10", "Errors 10"),
                    callback_data="adminui:logs:list:errors:10",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "Soporte 10", "Support 10"),
                    callback_data="adminui:logs:list:support:10",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "Pagos 20", "Payments 20"),
                    callback_data="adminui:logs:list:payments:20",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "Errores 20", "Errors 20"),
                    callback_data="adminui:logs:list:errors:20",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "Soporte 20", "Support 20"),
                    callback_data="adminui:logs:list:support:20",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "⬅️ Panel", "⬅️ Panel"),
                    callback_data="adminui:home",
                ),
            ],
        ]
    )


def _guide_text(action: str, locale: str | None = "es") -> str:
    guides = {
        "orders": (
            _tr(
                locale,
                "📋 <b>Órdenes Pendientes</b>\n\n"
                "Visualiza las órdenes que están en espera de revisión de pago.\n\n"
                "✍️ Ejemplo en texto:\n"
                "<code>/orders pending 10</code>\n\n"
                "🎯 Ahora elige cuántas quieres listar:",
                "📋 <b>Pending Orders</b>\n\n"
                "View orders waiting for payment review.\n\n"
                "✍️ Text example:\n"
                "<code>/orders pending 10</code>\n\n"
                "🎯 Now choose how many to list:",
            )
        ),
        "order": (
            _tr(
                locale,
                "🔎 <b>Ver Orden</b>\n"
                "Envía ahora el <b>número de orden</b> corto o el UUID.\n\n"
                "✍️ Ejemplos:\n"
                "<code>00004</code>\n"
                "<code>47f78e05-7086-4504-afb4-04da86acc2d9</code>",
                "🔎 <b>View Order</b>\n"
                "Send the short <b>order number</b> or the UUID.\n\n"
                "✍️ Examples:\n"
                "<code>00004</code>\n"
                "<code>47f78e05-7086-4504-afb4-04da86acc2d9</code>",
            )
        ),
        "approve": (
            _tr(
                locale,
                "✅ <b>Aprobar Orden</b>\n"
                "Envía ahora el número de orden o UUID para aprobar la orden.\n\n"
                "✍️ Ejemplo:\n"
                "<code>00004</code>",
                "✅ <b>Approve Order</b>\n"
                "Send the order number or UUID to approve the order.\n\n"
                "✍️ Example:\n"
                "<code>00004</code>",
            )
        ),
        "reject": (
            _tr(
                locale,
                "❌ <b>Rechazar Orden</b>\n"
                "Envía ahora el número de orden o UUID para rechazar la orden.\n\n"
                "✍️ Ejemplo:\n"
                "<code>00004</code>",
                "❌ <b>Reject Order</b>\n"
                "Send the order number or UUID to reject the order.\n\n"
                "✍️ Example:\n"
                "<code>00004</code>",
            )
        ),
        "refund": (
            _tr(
                locale,
                "💸 <b>Reembolso</b>\n"
                "Envía ahora el número de orden o UUID para iniciar reembolso.\n\n"
                "✍️ Ejemplo:\n"
                "<code>00004</code>",
                "💸 <b>Refund</b>\n"
                "Send the order number or UUID to start the refund.\n\n"
                "✍️ Example:\n"
                "<code>00004</code>",
            )
        ),
        "ban": (
            _tr(
                locale,
                "🚫 <b>Banear Usuario</b>\n"
                "Envía ahora el telegram_id del usuario a banear.\n\n"
                "✍️ Ejemplo:\n"
                "<code>7621162350</code>",
                "🚫 <b>Ban User</b>\n"
                "Send the user's telegram_id to ban.\n\n"
                "✍️ Example:\n"
                "<code>7621162350</code>",
            )
        ),
        "unban": (
            _tr(
                locale,
                "♻️ <b>Desbanear Usuario</b>\n"
                "Envía ahora el telegram_id del usuario a desbanear.\n\n"
                "✍️ Ejemplo:\n"
                "<code>7621162350</code>",
                "♻️ <b>Unban User</b>\n"
                "Send the user's telegram_id to unban.\n\n"
                "✍️ Example:\n"
                "<code>7621162350</code>",
            )
        ),
        "maint": (
            _tr(
                locale,
                "🛠 <b>Mantenimiento</b>\n"
                "Activa o desactiva el mantenimiento global.\n\n"
                "🎯 Selecciona ACTIVO o INACTIVO:",
                "🛠 <b>Maintenance</b>\n"
                "Enable or disable global maintenance.\n\n"
                "🎯 Choose ON or OFF:",
            )
        ),
        "broadcast": (
            _tr(
                locale,
                "📣 <b>Difusión</b>\n"
                "Paso 1/3 · Envía ahora el <b>texto</b> del mensaje masivo.\n\n"
                "✍️ Ejemplo:\n"
                "<code>Nuevo aviso importante para todos los usuarios.</code>",
                "📣 <b>Broadcast</b>\n"
                "Step 1/3 · Send the mass-message <b>text</b> now.\n\n"
                "✍️ Example:\n"
                "<code>Important update for all users.</code>",
            )
        ),
        "logs": (
            _tr(
                locale,
                "📜 <b>Logs</b>\n"
                "Consulta eventos recientes por categoría.\n\n"
                "🎯 Selecciona categoría y cantidad:",
                "📜 <b>Logs</b>\n"
                "Check recent events by category.\n\n"
                "🎯 Choose category and amount:",
            )
        ),
        "status": (
            _tr(
                locale,
                "📊 <b>Estado</b>\n"
                "Consulta el estado general de la API y los contadores principales.",
                "📊 <b>Status</b>\n"
                "Check API health and the main counters.",
            )
        ),
        "product_add": (
            _tr(
                locale,
                "➕ <b>Agregar Producto</b>\n\n"
                "Paso 1/4 · Envía en una sola línea este formato:\n"
                "<code>nombre | precio | categoria</code>\n\n"
                "✍️ Ejemplo:\n"
                "<code>Netflix Premium | 9.99 | TIENDA</code>\n\n"
                "Puedes usar categorías por defecto o nuevas.\n"
                "Ejemplo nueva: <code>Canva Pro | 5 | cuentas</code> → <code>CUENTAS</code>\n"
                "Si creas botón Home para esa categoría: <code>category:page:cuentas</code>\n"
                "Si no envías categoría, se usa <code>TIENDA</code>.",
                "➕ <b>Add Product</b>\n\n"
                "Step 1/4 · Send this format in one line:\n"
                "<code>name | price | category</code>\n\n"
                "✍️ Example:\n"
                "<code>Netflix Premium | 9.99 | STORE</code>\n\n"
                "You can use default or custom categories.\n"
                "Custom example: <code>Canva Pro | 5 | accounts</code> → <code>ACCOUNTS</code>\n"
                "If you create a Home button for it: <code>category:page:accounts</code>\n"
                "If no category is sent, <code>TIENDA</code> is used.",
            )
        ),
        "product_delete": (
            _tr(
                locale,
                "🗑 <b>Eliminar Producto</b>\n\n"
                "Selecciona primero la categoría.",
                "🗑 <b>Delete Product</b>\n\n"
                "Select the category first.",
            )
        ),
    }
    return guides.get(action, _build_admin_panel_text(locale))


async def _edit_panel_message(
    message: Message,
    text: str,
    reply_markup: Optional[InlineKeyboardMarkup] = None,
) -> None:
    try:
        await message.edit_text(text, reply_markup=reply_markup, parse_mode="HTML")
    except TelegramBadRequest as exc:
        detail = str(exc).lower()
        if "message is not modified" in detail:
            return
        await message.answer(text, reply_markup=reply_markup, parse_mode="HTML")
    except Exception:
        await message.answer(text, reply_markup=reply_markup, parse_mode="HTML")


async def _edit_state_panel_message(
    message: Message,
    state: FSMContext,
    text: str,
    reply_markup: Optional[InlineKeyboardMarkup] = None,
) -> None:
    data = await state.get_data()
    chat_id = data.get("admin_ui_panel_chat_id")
    message_id = data.get("admin_ui_panel_message_id")
    if chat_id and message_id:
        try:
            await message.bot.edit_message_text(
                text=text,
                chat_id=int(chat_id),
                message_id=int(message_id),
                reply_markup=reply_markup,
                parse_mode="HTML",
            )
            return
        except TelegramBadRequest as exc:
            if "message is not modified" in str(exc).lower():
                return
        except Exception:
            pass
    await message.answer(text, reply_markup=reply_markup, parse_mode="HTML")


async def _delete_message_safe(message: Message) -> None:
    try:
        await message.delete()
    except Exception:
        pass


async def _ensure_admin_http(message: Message) -> bool:
    if _admin_http_configured():
        return True
    await message.answer("⚠️ Falta API_TOKEN o ADMIN_API_KEY en `telegram-sales-bot/.env`.")
    return False


def _build_status_text(
    health: Dict[str, Any],
    maintenance: Dict[str, Any],
    counts: Dict[str, Any],
    summary: Dict[str, Any],
    locale: str | None = "es",
) -> str:
    waiting = counts.get("counts", {}).get("WAITING_PAYMENT", 0)
    paid = counts.get("counts", {}).get("PAID", 0)
    delivered = counts.get("counts", {}).get("DELIVERED", 0)
    cancelled = counts.get("counts", {}).get("CANCELLED", 0)
    users_total = _safe_int(summary.get("users_total"), 0, 0, 10**9)
    api_state = "OK" if health.get("ok") else "ERROR"
    maint_state = _tr(locale, "ACTIVO", "ON") if maintenance.get("active") else _tr(locale, "INACTIVO", "OFF")
    return _tr(
        locale,
        "📊 <b>Estado del Sistema</b>\n\n"
        f"🧠 API: <b>{api_state}</b>\n"
        f"🛠 Mantenimiento: <b>{maint_state}</b>\n\n"
        "👥 <b>Usuarios</b>\n"
        f"• 👤 Totales: <b>{users_total}</b>\n\n"
        "🧾 <b>Órdenes</b>\n"
        f"• ⏳ Pendientes de pago: <b>{waiting}</b>\n"
        f"• ✅ Pagadas: <b>{paid}</b>\n"
        f"• 📦 Entregadas: <b>{delivered}</b>\n"
        f"• ❌ Canceladas: <b>{cancelled}</b>",
        "📊 <b>System Status</b>\n\n"
        f"🧠 API: <b>{api_state}</b>\n"
        f"🛠 Maintenance: <b>{maint_state}</b>\n\n"
        "👥 <b>Users</b>\n"
        f"• 👤 Total: <b>{users_total}</b>\n\n"
        "🧾 <b>Orders</b>\n"
        f"• ⏳ Waiting payment: <b>{waiting}</b>\n"
        f"• ✅ Paid: <b>{paid}</b>\n"
        f"• 📦 Delivered: <b>{delivered}</b>\n"
        f"• ❌ Cancelled: <b>{cancelled}</b>",
    )


async def _fetch_status_text(locale: str | None = "es") -> str:
    health, maintenance, counts, summary = await asyncio.gather(
        api_client.ping_health(),
        api_client.admin_get_maintenance(),
        api_client.admin_get_order_status_counts(),
        api_client.admin_get_summary(),
    )
    return _build_status_text(health, maintenance, counts, summary, locale)


async def _build_orders_pending_text(limit: int, locale: str | None = "es") -> str:
    response = await api_client.admin_list_orders(
        status="WAITING_PAYMENT", page=1, page_size=limit
    )
    items = response.get("items", [])
    if not items:
        return _tr(
            locale,
            "✅ <b>No hay órdenes pendientes</b> en este momento.",
            "✅ <b>There are no pending orders</b> right now.",
        )

    lines = [
        _tr(
            locale,
            f"📋 <b>Órdenes pendientes</b>: <b>{len(items)}</b>\n",
            f"📋 <b>Pending orders</b>: <b>{len(items)}</b>\n",
        )
    ]
    for index, row in enumerate(items, start=1):
        order_number = row.get("order_number")
        order_label = (
            str(order_number).zfill(5)
            if order_number is not None
            else str(row.get("id", ""))[:8]
        )
        username = _escape_html(row.get("telegram_username") or "-")
        order_id = _escape_html(row.get("id"))
        lines.append(
            f"{index}. 🧾 <b>#{order_label}</b>\n"
            f"   🆔 <code>{order_id}</code>\n"
            f"   👤 @{username}\n"
            f"   🕒 {_fmt_dt(row.get('created_at'))}\n"
        )
    return "\n".join(lines)


async def _build_logs_text(category: str, limit: int, locale: str | None = "es") -> str:
    data = await api_client.admin_get_logs(category=category, limit=limit)
    items = data.get("items", [])
    if not items:
        return _tr(
            locale,
            f"ℹ️ <b>Sin registros</b> en la categoría <code>{_escape_html(category)}</code>.",
            f"ℹ️ <b>No records</b> in category <code>{_escape_html(category)}</code>.",
        )

    lines = [f"📚 <b>Logs</b> · <code>{_escape_html(category)}</code> · <b>{len(items)}</b>\n"]
    for row in items:
        created = _fmt_dt(row.get("created_at"))
        action = _escape_html(row.get("action") or row.get("kind") or "-")
        ref_id = _escape_html(row.get("ref_id") or row.get("entity_id") or "-")
        message_text = _escape_html((row.get("message") or "").strip().replace("\n", " "))
        message_short = message_text[:120] if message_text else ""
        lines.append(
            f"• 🕒 {created}\n"
            f"  ⚙️ {action}\n"
            f"  🆔 <code>{ref_id}</code>"
            + (f"\n  📝 {message_short}" if message_short else "")
            + "\n"
        )
    return "\n".join(lines)


def _build_earnings_keyboard(
    month_offset: int,
    week_offset: int,
    payload: Dict[str, Any],
    locale: str | None = "es",
) -> InlineKeyboardMarkup:
    month_data = payload.get("month") if isinstance(payload, dict) else {}
    week_data = payload.get("week") if isinstance(payload, dict) else {}
    month_data = month_data if isinstance(month_data, dict) else {}
    week_data = week_data if isinstance(week_data, dict) else {}

    current_month_offset = _safe_offset(month_data.get("offset"), month_offset)
    current_week_offset = _safe_offset(week_data.get("offset"), week_offset)

    month_older_offset = current_month_offset + 1 if month_data.get("has_older") else current_month_offset
    month_newer_offset = current_month_offset - 1 if month_data.get("has_newer") else current_month_offset
    week_older_offset = current_week_offset + 1 if week_data.get("has_older") else current_week_offset
    week_newer_offset = current_week_offset - 1 if week_data.get("has_newer") else current_week_offset

    month_older_text = _tr(locale, "⬅️ Mes", "⬅️ Month")
    month_newer_text = _tr(locale, "Mes ➡️", "Month ➡️")
    week_older_text = _tr(locale, "⬅️ Semana", "⬅️ Week")
    week_newer_text = _tr(locale, "Semana ➡️", "Week ➡️")

    if not month_data.get("has_older"):
        month_older_text = _tr(locale, "⛔ Inicio", "⛔ Start")
    if not month_data.get("has_newer"):
        month_newer_text = _tr(locale, "⛔ Actual", "⛔ Current")
    if not week_data.get("has_older"):
        week_older_text = _tr(locale, "⛔ Inicio", "⛔ Start")
    if not week_data.get("has_newer"):
        week_newer_text = _tr(locale, "⛔ Actual", "⛔ Current")

    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=month_older_text,
                    callback_data=f"adminui:earnings:{month_older_offset}:{current_week_offset}",
                ),
                InlineKeyboardButton(
                    text=month_newer_text,
                    callback_data=f"adminui:earnings:{month_newer_offset}:{current_week_offset}",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=week_older_text,
                    callback_data=f"adminui:earnings:{current_month_offset}:{week_older_offset}",
                ),
                InlineKeyboardButton(
                    text=week_newer_text,
                    callback_data=f"adminui:earnings:{current_month_offset}:{week_newer_offset}",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "⬇️ Descargar archivo", "⬇️ Download file"),
                    callback_data=f"adminui:earncsv:pick:{current_month_offset}:{current_week_offset}",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "⬅️ Panel", "⬅️ Panel"),
                    callback_data="adminui:home",
                )
            ],
        ]
    )


def _build_earnings_csv_picker_keyboard(
    month_offset: int,
    week_offset: int,
    locale: str | None = "es",
) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=_tr(locale, "⬇️ CSV Mes", "⬇️ CSV Month"),
                    callback_data=f"adminui:earncsv:month:{month_offset}:{week_offset}",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "⬇️ CSV Semana", "⬇️ CSV Week"),
                    callback_data=f"adminui:earncsv:week:{month_offset}:{week_offset}",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "⬇️ XLSX Mes", "⬇️ XLSX Month"),
                    callback_data=f"adminui:earncsv:xmonth:{month_offset}:{week_offset}",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "⬇️ XLSX Semana", "⬇️ XLSX Week"),
                    callback_data=f"adminui:earncsv:xweek:{month_offset}:{week_offset}",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "⬅️ Ganancias", "⬅️ Earnings"),
                    callback_data=f"adminui:earnings:{month_offset}:{week_offset}",
                ),
            ],
        ]
    )


async def _build_sales_insights_view(
    month_offset: int,
    week_offset: int,
    locale: str | None = "es",
) -> tuple[str, InlineKeyboardMarkup]:
    data = await api_client.admin_get_sales_insights(
        month_offset=month_offset,
        week_offset=week_offset,
    )
    month = data.get("month") or {}
    week = data.get("week") or {}
    best_day = data.get("best_day") or {}

    month_label = _format_month_year_label(month.get("start_date"), locale)
    month_range = _format_date_range(month.get("start_date"), month.get("end_date"))
    week_range = _format_date_range(week.get("start_date"), week.get("end_date"))
    best_day_date = _fmt_dt(best_day.get("date"))
    best_day_earnings = _fmt_amount(best_day.get("earnings_usd"))

    text = _tr(
        locale,
        "💰 <b>Ganancias</b>\n\n"
        f"• Hoy: ${_fmt_amount(data.get('today_earnings_usd'))}\n"
        "────────────────────\n"
        f"🗓 {_escape_html(month_label)}\n\n"
        f"• Rango: {_escape_html(month_range)}\n"
        f"• Ganancia: ${_fmt_amount(month.get('earnings_usd'))}\n"
        "────────────────────\n"
        "📆 Semana seleccionada:\n\n"
        f"• Rango: {_escape_html(week_range)}\n"
        f"• Ganancia: ${_fmt_amount(week.get('earnings_usd'))}\n"
        "────────────────────\n"
        "📈 Mejor día histórico\n\n"
        f"• Fecha: {_escape_html(best_day_date)}\n"
        f"• Ganancia: ${best_day_earnings}",
        "💰 <b>Earnings</b>\n\n"
        f"• Today: ${_fmt_amount(data.get('today_earnings_usd'))}\n"
        "────────────────────\n"
        f"🗓 {_escape_html(month_label)}\n\n"
        f"• Range: {_escape_html(month_range)}\n"
        f"• Earnings: ${_fmt_amount(month.get('earnings_usd'))}\n"
        "────────────────────\n"
        "📆 Selected week:\n\n"
        f"• Range: {_escape_html(week_range)}\n"
        f"• Earnings: ${_fmt_amount(week.get('earnings_usd'))}\n"
        "────────────────────\n"
        "📈 Best day ever\n\n"
        f"• Date: {_escape_html(best_day_date)}\n"
        f"• Earnings: ${best_day_earnings}",
    )
    keyboard = _build_earnings_keyboard(month_offset, week_offset, data, locale)
    return text, keyboard


def _build_top_sales_keyboard(
    month_offset: int,
    payload: Dict[str, Any],
    locale: str | None = "es",
) -> InlineKeyboardMarkup:
    current_offset = _safe_offset(payload.get("month_offset"), month_offset)
    max_offset = _safe_offset(payload.get("month_max_offset"), 0)

    has_older = current_offset < max_offset
    has_newer = current_offset > 0

    older_offset = current_offset + 1 if has_older else current_offset
    newer_offset = current_offset - 1 if has_newer else current_offset

    older_text = _tr(locale, "⬅️ Mes", "⬅️ Month") if has_older else _tr(locale, "⛔ Inicio", "⛔ Start")
    newer_text = _tr(locale, "Mes ➡️", "Month ➡️") if has_newer else _tr(locale, "⛔ Actual", "⛔ Current")

    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=older_text,
                    callback_data=f"adminui:topsales:{older_offset}",
                ),
                InlineKeyboardButton(
                    text=newer_text,
                    callback_data=f"adminui:topsales:{newer_offset}",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "⬅️ Panel", "⬅️ Panel"),
                    callback_data="adminui:home",
                )
            ],
        ]
    )


async def _build_top_products_month_view(
    limit: int,
    month_offset: int,
    locale: str | None = "es",
) -> tuple[str, InlineKeyboardMarkup]:
    data = await api_client.admin_get_top_products_month(limit=limit, month_offset=month_offset)
    items = data.get("items") or []
    month_title = _format_month_year_label(data.get("month_start_date"), locale)
    month_line = _tr(
        locale,
        f"Mes: {month_title}",
        f"Month: {month_title}",
    )
    keyboard = _build_top_sales_keyboard(month_offset, data, locale)

    if not items:
        return _tr(
            locale,
            "🏆 <b>Top productos del mes</b>\n"
            f"{_escape_html(month_line)}\n"
            "────────────────────\n"
            "No hay ventas registradas todavía en este mes.",
            "🏆 <b>Top products this month</b>\n"
            f"{_escape_html(month_line)}\n"
            "────────────────────\n"
            "No recorded sales yet this month.",
        ), keyboard

    lines = [
        _tr(
            locale,
            f"🏆 <b>Top {limit} productos del mes</b>\n\n"
            f"{_escape_html(month_line)}\n"
            "────────────────────",
            f"🏆 <b>Top {limit} products this month</b>\n\n"
            f"{_escape_html(month_line)}\n"
            "────────────────────",
        )
    ]

    for index, item in enumerate(items, start=1):
        name = _escape_html(item.get("name") or "-")
        sold_count = int(item.get("sold_count") or 0)
        revenue = _fmt_amount(item.get("revenue_usd"))
        lines.append(
            _tr(
                locale,
                f"{index}. <b>{name}</b>\n"
                f"   • Ventas: {sold_count} · Ingreso: ${revenue}",
                f"{index}. <b>{name}</b>\n"
                f"   • Sales: {sold_count} · Revenue: ${revenue}",
            )
        )
        if index < len(items):
            lines.append("────────────────────")

    return "\n".join(lines), keyboard


async def _build_product_delete_view(
    category_key: str,
    header: str | None = None,
    page_size: int = 50,
    locale: str | None = "es",
) -> tuple[str, InlineKeyboardMarkup]:
    category_key = _normalize_category_key(category_key) or "TIENDA"
    page = 1
    all_items: list[Dict[str, Any]] = []
    while True:
        response = await api_client.list_products(page=page, page_size=50, telegram_id=None)
        batch = response.get("items", [])
        if not batch:
            break
        all_items.extend(batch)
        total_pages = int(response.get("total_pages") or 1)
        if page >= total_pages:
            break
        page += 1

    items = [
        item
        for item in all_items
        if _normalize_category_key(item.get("category_key")) == category_key
    ][:page_size]

    if not items:
        base_text = _tr(
            locale,
            f"🗑 <b>Eliminar Producto · {_escape_html(category_key)}</b>\n\n"
            "No hay productos activos en esta categoría.",
            f"🗑 <b>Delete Product · {_escape_html(category_key)}</b>\n\n"
            "There are no active products in this category.",
        )
        if header:
            base_text = f"{header}\n\n{base_text}"
        return base_text, await _build_delete_categories_keyboard(locale)

    lines = [_tr(
        locale,
        f"🗑 <b>Eliminar Producto · {_escape_html(category_key)}</b>\n",
        f"🗑 <b>Delete Product · {_escape_html(category_key)}</b>\n",
    ), _tr(locale, "Selecciona uno para desactivarlo:\n", "Select one to deactivate:\n")]
    for index, item in enumerate(items, start=1):
        name = _escape_html(item.get("name") or "Producto")
        lines.append(f"{index}. {name}")
    text = "\n".join(lines)
    if header:
        text = f"{header}\n\n{text}"
    return text, _build_delete_products_keyboard(items, category_key, locale)


async def _find_active_product_by_id(
    product_id: str,
    category_key: str | None = None,
) -> Dict[str, Any] | None:
    target = str(product_id or "").strip()
    if not target:
        return None
    normalized_category = _normalize_category_key(category_key)
    page = 1
    while True:
        response = await api_client.list_products(
            page=page,
            page_size=50,
            telegram_id=None,
            category_key=normalized_category or None,
        )
        batch = response.get("items", [])
        if not batch:
            return None
        for item in batch:
            if str(item.get("id") or "").strip() == target:
                return item
        total_pages = int(response.get("total_pages") or 1)
        if page >= total_pages:
            return None
        page += 1


def _build_product_create_payload(raw_text: str, locale: str | None = "es") -> Dict[str, Any]:
    parts = [part.strip() for part in raw_text.split("|")]
    if len(parts) < 2:
        raise ValueError(
            _tr(
                locale,
                "Formato inválido. Usa: <code>nombre | precio | categoria</code>",
                "Invalid format. Use: <code>name | price | category</code>",
            )
        )

    name = parts[0]
    if not name:
        raise ValueError(_tr(locale, "El nombre no puede estar vacío.", "Name cannot be empty."))

    price_raw = parts[1].replace(",", ".")
    try:
        price = float(price_raw)
    except ValueError as exc:
        raise ValueError(_tr(locale, "El precio debe ser numérico.", "Price must be numeric.")) from exc

    if price < 0:
        raise ValueError(_tr(locale, "El precio no puede ser negativo.", "Price cannot be negative."))

    raw_category = parts[2] if len(parts) > 2 else ""
    if raw_category:
        category = _normalize_category_key(raw_category)
        if not category:
            raise ValueError(
                _tr(
                    locale,
                    "Categoría inválida. Usa letras/números y guion bajo.",
                    "Invalid category. Use letters/numbers and underscore.",
                )
            )
    else:
        category = "TIENDA"

    return {
        "display_name": name,
        "price": round(price, 2),
        "category_key": category,
        "stock_mode": "SIMPLE",
        "show_stock": True,
        "unique_purchase": False,
        "out_of_stock": False,
        "delivery_type": "TEXT",
        "delivery_payload": {"text": ""},
        "description": "",
        "image_url": None,
    }


def _build_product_description(description_text: str, locale: str | None = "es") -> str:
    lines = [line.strip() for line in description_text.splitlines() if line.strip()]
    if not lines:
        raise ValueError(_tr(locale, "La descripcion no puede estar vacia.", "Description cannot be empty."))
    if len(lines) > 8:
        raise ValueError(_tr(locale, "La descripcion admite maximo 8 lineas.", "Description allows up to 8 lines."))
    return "\n".join(lines)


def _build_product_delivery_text(delivery_text: str, locale: str | None = "es") -> str:
    text = delivery_text.strip()
    if not text:
        raise ValueError(
            _tr(
                locale,
                "El texto para el cliente no puede estar vacío.",
                "The customer text cannot be empty.",
            )
        )
    if len(text) > 3500:
        raise ValueError(
            _tr(
                locale,
                "El texto para el cliente es demasiado largo.",
                "The customer text is too long.",
            )
        )
    return text


def _build_product_admin_link(product: Dict[str, Any]) -> str:
    if not str(BOT_USERNAME or "").strip():
        return ""
    product_id = str(product.get("id") or "").strip()
    product_code = str(product.get("code") or "").strip().upper()
    product_token = product_code or product_id
    if not product_token:
        return ""
    payload = build_product_start_payload(product_token, None)
    if not payload:
        payload = build_product_start_payload(product_id, None)
    if not payload:
        return ""
    return build_bot_start_link(BOT_USERNAME, payload) or ""


def _build_product_created_text(product: Dict[str, Any], locale: str | None = "es") -> str:
    code = _escape_html(product.get("code") or "-")
    name = _escape_html(product.get("name") or "-")
    category = _escape_html(product.get("category_key") or "-")
    product_id = _escape_html(product.get("id"))
    price = _fmt_amount(product.get("price"))
    link = _build_product_admin_link(product)
    link_block = ""
    if link:
        link_block = _tr(
            locale,
            f"\n🔗 Link: <code>{_escape_html(link)}</code>",
            f"\n🔗 Link: <code>{_escape_html(link)}</code>",
        )
    return _tr(
        locale,
        "✅ <b>Producto creado</b>\n\n"
        f"🏷 Código: <b>{code}</b>\n"
        f"📦 Nombre: <b>{name}</b>\n"
        f"🧩 Categoría: <b>{category}</b>\n"
        f"💵 Precio: <b>${price}</b>\n"
        f"🆔 ID: <code>{product_id}</code>"
        f"{link_block}",
        "✅ <b>Product created</b>\n\n"
        f"🏷 Code: <b>{code}</b>\n"
        f"📦 Name: <b>{name}</b>\n"
        f"🧩 Category: <b>{category}</b>\n"
        f"💵 Price: <b>${price}</b>\n"
        f"🆔 ID: <code>{product_id}</code>"
        f"{link_block}",
    )


async def _build_order_detail_text(order_ref: str, locale: str | None = "es") -> str:
    data = await api_client.admin_get_order(order_ref)
    order = data.get("order", {})
    user = data.get("user", {})
    payment = data.get("payment") or {}
    totals = data.get("totals") or {}
    local_total = data.get("local_total") or {}
    items = data.get("items") or []

    item_lines = []
    for item in items[:5]:
        name = _escape_html(item.get("name") or "-")
        qty = item.get("qty") or 1
        total = item.get("line_total_usd")
        if total is None:
            total = item.get("unit_price_usd") or 0
        item_lines.append(f"• {name} x{qty} — <b>${_fmt_amount(total)}</b>")
    items_block = "\n".join(item_lines) if item_lines else _tr(locale, "- Sin items", "- No items")

    order_number = order.get("order_number")
    order_number_text = str(order_number).zfill(5) if order_number is not None else "-"
    markup_percent = totals.get("markup_percent")
    markup_text = f"{markup_percent}%" if markup_percent is not None else "-"

    return (
        _tr(locale, "🧾 <b>Detalle de la Orden</b>\n\n", "🧾 <b>Order Detail</b>\n\n")
        + f"🆔 ID: <code>{_escape_html(order.get('id'))}</code>\n"
        + f"🏷 {_tr(locale, 'Número', 'Number')}: <code>{_escape_html(order_number_text)}</code>\n"
        + f"📌 {_tr(locale, 'Estado', 'Status')}: <b>{_escape_html(_order_status_text(order.get('status'), locale))}</b>\n\n"
        + _tr(locale, "👤 <b>Usuario</b>\n", "👤 <b>User</b>\n")
        + f"• ID: <code>{_escape_html(user.get('telegram_id'))}</code>\n"
        + f"• Username: @{_escape_html(user.get('telegram_username') or '-')}\n\n"
        + _tr(locale, "💳 <b>Pago</b>\n", "💳 <b>Payment</b>\n")
        + f"• {_tr(locale, 'Método', 'Method')}: <b>{_escape_html(payment.get('payment_method') or '-')}</b>\n"
        + f"• {_tr(locale, 'Revisión', 'Review')}: <b>{_escape_html(_payment_review_text(payment.get('review_status'), locale))}</b>\n\n"
        + _tr(locale, "💰 <b>Totales</b>\n", "💰 <b>Totals</b>\n")
        + f"• USD: <b>${_fmt_amount(totals.get('total_usd'))}</b>\n"
        + f"• Markup: <b>{markup_text}</b>\n"
        + f"• Local: <b>{_fmt_amount(local_total.get('amount'))} {_escape_html(local_total.get('currency') or '-')}</b>\n\n"
        + _tr(locale, "🕒 <b>Fechas</b>\n", "🕒 <b>Dates</b>\n")
        + f"• {_tr(locale, 'Creada', 'Created')}: {_fmt_dt(order.get('created_at'))}\n"
        + f"• {_tr(locale, 'Pagada', 'Paid')}: {_fmt_dt(order.get('paid_at'))}\n\n"
        + _tr(locale, "📦 <b>Productos</b>\n", "📦 <b>Products</b>\n")
        + f"{items_block}"
    )


async def _build_approve_order_text(order_ref: str, locale: str | None = "es") -> str:
    try:
        response = await api_client.admin_mark_order_paid(order_ref)
    except httpx.HTTPStatusError as exc:
        payload: Dict[str, Any]
        try:
            payload = exc.response.json()
        except Exception:
            payload = {}
        error_code = str(payload.get("error") or "").strip().upper()
        if exc.response.status_code == 409 and error_code == "ORDER_ALREADY_FINALIZED":
            data = await api_client.admin_get_order(order_ref)
            order = data.get("order", {})
            status = order.get("status") or "OK"
            order_number = order.get("order_number")
            order_number_text = (
                str(order_number).zfill(5) if order_number is not None else "-"
            )
            return (
                _tr(
                    locale,
                    "ℹ️ <b>La orden ya estaba finalizada</b>\n\n",
                    "ℹ️ <b>The order was already finalized</b>\n\n",
                )
                + f"🧾 {_tr(locale, 'Referencia', 'Reference')}: <code>{_escape_html(order_ref)}</code>\n"
                + f"🏷 {_tr(locale, 'Número', 'Number')}: <b>#{order_number_text}</b>\n"
                + f"📌 {_tr(locale, 'Estado actual', 'Current status')}: "
                + f"<b>{_escape_html(_order_status_text(status, locale))}</b>\n\n"
                + _tr(
                    locale,
                    "No se aprobó de nuevo porque solo se pueden aprobar órdenes en espera de pago.",
                    "It was not approved again because only orders waiting for payment can be approved.",
                )
            )
        raise
    status = response.get("order", {}).get("status") or response.get("status") or "OK"
    return (
        _tr(locale, "✅ <b>Orden aprobada correctamente</b>\n\n", "✅ <b>Order approved successfully</b>\n\n")
        + f"🧾 {_tr(locale, 'Referencia', 'Reference')}: <code>{_escape_html(order_ref)}</code>\n"
        f"📌 {_tr(locale, 'Estado', 'Status')}: <b>{_escape_html(_order_status_text(status, locale))}</b>"
    )


async def _build_reject_order_text(order_ref: str, reason: str, locale: str | None = "es") -> str:
    await api_client.admin_reject_order(order_ref, mode="retry", reason=reason)
    return (
        _tr(locale, "❌ <b>Orden rechazada (modo reintento)</b>\n\n", "❌ <b>Order rejected (retry mode)</b>\n\n")
        + f"🧾 {_tr(locale, 'Referencia', 'Reference')}: <code>{_escape_html(order_ref)}</code>\n"
        f"📝 {_tr(locale, 'Motivo', 'Reason')}: {_escape_html(reason)}"
    )


async def _build_refund_order_text(order_ref: str, reason: str, locale: str | None = "es") -> str:
    response = await api_client.admin_refund_order(order_ref, reason=reason)
    refund = response.get("refund", {})
    return (
        _tr(locale, "💸 <b>Reembolso aplicado</b>\n\n", "💸 <b>Refund applied</b>\n\n")
        + f"🧾 {_tr(locale, 'Referencia', 'Reference')}: <code>{_escape_html(order_ref)}</code>\n"
        f"💰 {_tr(locale, 'Monto', 'Amount')}: <b>${_fmt_amount(refund.get('amount'))}</b>\n"
        f"🏷 {_tr(locale, 'Tipo', 'Type')}: <b>{_escape_html(_refund_type_text(refund.get('refund_type'), locale))}</b>\n"
        f"📝 {_tr(locale, 'Motivo', 'Reason')}: {_escape_html(reason)}"
    )


async def _build_ban_user_text(admin_telegram_id: int | None, telegram_id: int, reason: str) -> str:
    if BOT_TO_API_SECRET:
        response = await api_client.ban_user(
            telegram_id,
            {
                "reason": reason,
                "admin_telegram_id": admin_telegram_id,
            },
            BOT_TO_API_SECRET,
        )
        if isinstance(response, dict) and response.get("status_code"):
            return "❌ <b>No se pudo banear usuario.</b>"
        already = bool(response.get("already_banned")) if isinstance(response, dict) else False
        if already:
            return "ℹ️ <b>El usuario ya estaba baneado.</b>"
        return "✅ <b>Usuario baneado correctamente.</b>"

    if not _admin_http_configured():
        return "⚠️ <b>Falta BOT_TO_API_SECRET o credencial admin para banear.</b>"

    result = await api_client.admin_toggle_ban(telegram_id)
    if result.get("banned"):
        return "✅ <b>Usuario baneado correctamente.</b>"
    return "ℹ️ <b>El usuario ya estaba desbaneado.</b>"


async def _build_unban_user_text(telegram_id: int) -> str:
    status = await api_client.get_ban_status(telegram_id)
    if not status.get("banned"):
        return "ℹ️ <b>Ese usuario no está baneado.</b>"
    result = await api_client.admin_toggle_ban(telegram_id)
    if result.get("banned") is False:
        return "✅ <b>Usuario desbaneado correctamente.</b>"
    return "❌ <b>No se pudo desbanear al usuario.</b>"


def _parse_broadcast_buttons_input(raw_text: str, locale: str | None = "es") -> list[Dict[str, str]]:
    text = (raw_text or "").strip()
    if not text:
        return []
    if text.lower() in _BROADCAST_SKIP_WORDS:
        return []

    parsed: list[Dict[str, str]] = []
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return []
    for row_index, line in enumerate(lines):
        specs = [segment.strip() for segment in line.split(";") if segment.strip()]
        if not specs:
            continue
        for spec in specs:
            parts = [part.strip() for part in spec.split("|", 1)]
            if len(parts) != 2:
                raise ValueError(
                    _tr(
                        locale,
                        "Formato inválido. Usa: texto | https://enlace",
                        "Invalid format. Use: text | https://link",
                    )
                )
            label, url = parts
            label = _sanitize_broadcast_button_text(label)
            if not label:
                raise ValueError(_tr(locale, "Falta el texto del botón.", "Button text is required."))
            if not (url.startswith("http://") or url.startswith("https://")):
                raise ValueError(
                    _tr(
                        locale,
                        "El enlace debe iniciar con http:// o https://",
                        "Link must start with http:// or https://",
                    )
                )
            parsed.append({"text": label[:64], "url": url, "row": row_index})
            if len(parsed) >= 12:
                return parsed
    return parsed


async def _build_broadcast_result_text(
    text: str,
    locale: str | None = "es",
    buttons: Optional[list[Dict[str, str]]] = None,
    media_file_id: str | None = None,
    media_kind: str | None = None,
) -> str:
    create_res = await api_client.admin_create_broadcast(
        text,
        segment="ALL_USERS",
        buttons=buttons or [],
        media_file_id=media_file_id,
        media_kind=media_kind,
    )
    broadcast = create_res.get("broadcast", {})
    broadcast_id = str(broadcast.get("id"))
    if not broadcast_id:
        return _tr(
            locale,
            "❌ <b>No se pudo crear la difusión.</b>",
            "❌ <b>Could not create the broadcast.</b>",
        )
    send_res = await api_client.admin_send_broadcast(broadcast_id)
    result = send_res.get("result", {})
    media_text = _tr(locale, "Sin multimedia", "No media")
    media_kind_safe = str(media_kind or "").strip().lower()
    if media_kind_safe == "photo":
        media_text = _tr(locale, "Imagen", "Image")
    elif media_kind_safe == "animation":
        media_text = _tr(locale, "GIF", "GIF")
    elif media_kind_safe == "video":
        media_text = _tr(locale, "Video", "Video")
    return (
        _tr(locale, "📣 <b>Difusión enviada</b>\n\n", "📣 <b>Broadcast sent</b>\n\n")
        + f"🆔 ID: <code>{_escape_html(broadcast_id)}</code>\n"
        f"🔗 {_tr(locale, 'Botones', 'Buttons')}: <b>{len(buttons or [])}</b>\n"
        f"🖼 {_tr(locale, 'Multimedia', 'Media')}: <b>{_escape_html(media_text)}</b>\n"
        f"🎯 Objetivo: <b>{result.get('target_count')}</b>\n"
        f"✅ Enviados: <b>{result.get('sent_count')}</b>\n"
        f"❌ Fallidos: <b>{result.get('failed_count')}</b>"
    )


async def _send_status(message: Message, locale: str | None = "es") -> None:
    await message.answer(await _fetch_status_text(locale), parse_mode="HTML")


async def _send_orders_pending(message: Message, limit: int, locale: str | None = "es") -> None:
    await message.answer(await _build_orders_pending_text(limit, locale), parse_mode="HTML")


async def _send_order_detail(message: Message, order_ref: str) -> None:
    data = await api_client.admin_get_order(order_ref)
    order = data.get("order", {})
    user = data.get("user", {})
    payment = data.get("payment") or {}
    totals = data.get("totals") or {}
    local_total = data.get("local_total") or {}
    items = data.get("items") or []
    item_lines = []
    for item in items[:5]:
        name = _escape_html(item.get("name") or "-")
        qty = item.get("qty") or 1
        total = item.get("line_total_usd")
        if total is None:
            total = item.get("unit_price_usd") or 0
        item_lines.append(f"• {name} x{qty} — <b>${_fmt_amount(total)}</b>")
    items_block = "\n".join(item_lines) if item_lines else "- Sin items"
    order_number = order.get("order_number")
    order_number_text = str(order_number).zfill(5) if order_number is not None else "-"
    order_id = _escape_html(order.get("id"))
    status = _escape_html(order.get("status"))
    telegram_id = _escape_html(user.get("telegram_id"))
    username = _escape_html(user.get("telegram_username") or "-")
    payment_method = _escape_html(payment.get("payment_method") or "-")
    review_status = _escape_html(payment.get("review_status") or "-")
    markup_percent = totals.get("markup_percent")
    markup_text = f"{markup_percent}%" if markup_percent is not None else "-"
    local_amount = _fmt_amount(local_total.get("amount"))
    local_currency = _escape_html(local_total.get("currency") or "-")
    text = (
        "🧾 <b>Detalle de la Orden</b>\n\n"
        f"🆔 ID: <code>{order_id}</code>\n"
        f"🏷 Número: <code>{_escape_html(order_number_text)}</code>\n"
        f"📌 Estado: <b>{status}</b>\n\n"
        "👤 <b>Usuario</b>\n"
        f"• ID: <code>{telegram_id}</code>\n"
        f"• Username: @{username}\n\n"
        "💳 <b>Pago</b>\n"
        f"• Método: <b>{payment_method}</b>\n"
        f"• Revisión: <b>{review_status}</b>\n\n"
        "💰 <b>Totales</b>\n"
        f"• USD: <b>${_fmt_amount(totals.get('total_usd'))}</b>\n"
        f"• Markup: <b>{markup_text}</b>\n"
        f"• Local: <b>{local_amount} {local_currency}</b>\n\n"
        "🕒 <b>Fechas</b>\n"
        f"• Creada: {_fmt_dt(order.get('created_at'))}\n"
        f"• Pagada: {_fmt_dt(order.get('paid_at'))}\n\n"
        "📦 <b>Productos</b>\n"
        f"{items_block}"
    )
    await message.answer(text, parse_mode="HTML")


async def _approve_order(message: Message, order_ref: str) -> None:
    response = await api_client.admin_mark_order_paid(order_ref)
    status = (
        response.get("order", {}).get("status")
        or response.get("status")
        or "OK"
    )
    await message.answer(
        "✅ <b>Orden aprobada correctamente</b>\n\n"
        f"🧾 Referencia: <code>{_escape_html(order_ref)}</code>\n"
        f"📌 Estado: <b>{_escape_html(status)}</b>",
        parse_mode="HTML",
    )


async def _reject_order(message: Message, order_ref: str, reason: str) -> None:
    await api_client.admin_reject_order(order_ref, mode="retry", reason=reason)
    await message.answer(
        "❌ <b>Orden rechazada (modo retry)</b>\n\n"
        f"🧾 Referencia: <code>{_escape_html(order_ref)}</code>\n"
        f"📝 Motivo: {_escape_html(reason)}",
        parse_mode="HTML",
    )


async def _refund_order(message: Message, order_ref: str, reason: str) -> None:
    response = await api_client.admin_refund_order(order_ref, reason=reason)
    refund = response.get("refund", {})
    await message.answer(
        "💸 <b>Reembolso aplicado</b>\n\n"
        f"🧾 Referencia: <code>{_escape_html(order_ref)}</code>\n"
        f"💰 Monto: <b>${_fmt_amount(refund.get('amount'))}</b>\n"
        f"🏷 Tipo: <b>{_escape_html(refund.get('refund_type') or '-')}</b>\n"
        f"📝 Motivo: {_escape_html(reason)}",
        parse_mode="HTML",
    )


async def _ban_user(message: Message, telegram_id: int, reason: str) -> None:
    if BOT_TO_API_SECRET:
        response = await api_client.ban_user(
            telegram_id,
            {
                "reason": reason,
                "admin_telegram_id": message.from_user.id if message.from_user else None,
            },
            BOT_TO_API_SECRET,
        )
        if isinstance(response, dict) and response.get("status_code"):
            await message.answer("❌ No se pudo banear usuario.")
            return
        already = bool(response.get("already_banned")) if isinstance(response, dict) else False
        if already:
            await message.answer("ℹ️ <b>El usuario ya estaba baneado.</b>", parse_mode="HTML")
        else:
            await message.answer("✅ <b>Usuario baneado correctamente.</b>", parse_mode="HTML")
        return
    if not _admin_http_configured():
        await message.answer("⚠️ Falta BOT_TO_API_SECRET o credencial admin para banear.")
        return
    result = await api_client.admin_toggle_ban(telegram_id)
    if result.get("banned"):
        await message.answer("✅ <b>Usuario baneado correctamente.</b>", parse_mode="HTML")
    else:
        await message.answer("ℹ️ <b>El usuario ya estaba desbaneado.</b>", parse_mode="HTML")


async def _unban_user(message: Message, telegram_id: int) -> None:
    status = await api_client.get_ban_status(telegram_id)
    if not status.get("banned"):
        await message.answer("ℹ️ <b>Ese usuario no está baneado.</b>", parse_mode="HTML")
        return
    result = await api_client.admin_toggle_ban(telegram_id)
    if result.get("banned") is False:
        await message.answer("✅ <b>Usuario desbaneado correctamente.</b>", parse_mode="HTML")
    else:
        await message.answer("❌ <b>No se pudo desbanear al usuario.</b>", parse_mode="HTML")


async def _set_maintenance(message: Message, active: bool) -> None:
    response = await api_client.admin_set_maintenance(active)
    state = "ON" if response.get("active") else "OFF"
    await message.answer(
        "🛠 <b>Mantenimiento actualizado</b>\n\n"
        f"Estado actual: <b>{state}</b>",
        parse_mode="HTML",
    )


async def _send_broadcast(message: Message, text: str) -> None:
    create_res = await api_client.admin_create_broadcast(text, segment="ALL_USERS")
    broadcast = create_res.get("broadcast", {})
    broadcast_id = str(broadcast.get("id"))
    if not broadcast_id:
        await message.answer("❌ <b>No se pudo crear el broadcast.</b>", parse_mode="HTML")
        return
    send_res = await api_client.admin_send_broadcast(broadcast_id)
    result = send_res.get("result", {})
    await message.answer(
        "📣 <b>Broadcast enviado</b>\n\n"
        f"🆔 ID: <code>{_escape_html(broadcast_id)}</code>\n"
        f"🎯 Objetivo: <b>{result.get('target_count')}</b>\n"
        f"✅ Enviados: <b>{result.get('sent_count')}</b>\n"
        f"❌ Fallidos: <b>{result.get('failed_count')}</b>",
        parse_mode="HTML",
    )


async def _send_logs(
    message: Message, category: str, limit: int, locale: str | None = "es"
) -> None:
    await message.answer(await _build_logs_text(category, limit, locale), parse_mode="HTML")


async def _admin_guard_callback(callback: CallbackQuery) -> Optional[str]:
    if not callback.from_user:
        return None
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
        return None
    if callback.from_user.id not in ADMIN_TELEGRAM_IDS:
        await callback.answer(t(locale, "admin_not_authorized"), show_alert=True)
        return None
    return locale


@router.message(Command("admin"))
@router.message(F.text == "admin")
@router.message(F.text == "Admin")
async def cmd_admin_panel(message: Message, state: FSMContext) -> None:
    locale = await _admin_guard(message)
    if not locale:
        return
    await state.clear()
    panel_message = await message.answer(
        _build_admin_panel_text(locale),
        reply_markup=_build_admin_panel_keyboard(locale),
        parse_mode="HTML",
    )
    await state.update_data(
        admin_ui_panel_chat_id=panel_message.chat.id,
        admin_ui_panel_message_id=panel_message.message_id,
    )


@router.callback_query(F.data.startswith("adminui:"))
async def cb_admin_panel_help(callback: CallbackQuery, state: FSMContext) -> None:
    locale = await _admin_guard_callback(callback)
    if not locale:
        return
    if not callback.message:
        await callback.answer()
        return
    parts = (callback.data or "adminui:home").split(":")
    action = parts[1] if len(parts) > 1 else "home"
    panel_anchor = {
        "admin_ui_panel_chat_id": callback.message.chat.id,
        "admin_ui_panel_message_id": callback.message.message_id,
    }

    try:
        if action == "home":
            await state.clear()
            await _edit_panel_message(
                callback.message,
                _build_admin_panel_text(locale),
                reply_markup=_build_admin_panel_keyboard(locale),
            )
            return

        if not _admin_http_configured():
            await _edit_panel_message(
                callback.message,
                _tr(
                    locale,
                    "⚠️ Falta API_TOKEN o ADMIN_API_KEY en <code>telegram-sales-bot/.env</code>.",
                    "⚠️ API_TOKEN or ADMIN_API_KEY is missing in <code>telegram-sales-bot/.env</code>.",
                ),
                reply_markup=_build_back_to_panel_keyboard(locale),
            )
            return

        if action == "status":
            await state.clear()
            await _edit_panel_message(
                callback.message,
                await _fetch_status_text(locale),
                reply_markup=_build_back_to_panel_keyboard(locale),
            )
            return

        if action == "earnings":
            await state.clear()
            requested_month_offset = _safe_offset(parts[2] if len(parts) > 2 else 0)
            requested_week_offset = _safe_offset(parts[3] if len(parts) > 3 else 0)
            earnings_text, earnings_keyboard = await _build_sales_insights_view(
                month_offset=requested_month_offset,
                week_offset=requested_week_offset,
                locale=locale,
            )
            await _edit_panel_message(
                callback.message,
                earnings_text,
                reply_markup=earnings_keyboard,
            )
            return

        if action == "earncsv":
            await state.clear()
            mode = str(parts[2] if len(parts) > 2 else "pick").lower()
            month_offset = _safe_offset(parts[3] if len(parts) > 3 else 0)
            week_offset = _safe_offset(parts[4] if len(parts) > 4 else 0)

            if mode == "pick":
                await _edit_panel_message(
                    callback.message,
                    _tr(
                        locale,
                        "⬇️ <b>Descargar ganancias</b>\n\nSelecciona formato y período:",
                        "⬇️ <b>Download earnings</b>\n\nSelect format and period:",
                    ),
                    reply_markup=_build_earnings_csv_picker_keyboard(
                        month_offset,
                        week_offset,
                        locale,
                    ),
                )
                return

            if mode in {"month", "week", "xmonth", "xweek"}:
                period = "week" if mode.endswith("week") else "month"
                wants_xlsx = mode.startswith("x")
                file_result = (
                    await api_client.admin_download_sales_export_xlsx(
                        period=period,
                        month_offset=month_offset,
                        week_offset=week_offset,
                    )
                    if wants_xlsx
                    else await api_client.admin_download_sales_export_csv(
                        period=period,
                        month_offset=month_offset,
                        week_offset=week_offset,
                    )
                )
                status_code = int(file_result.get("status_code") or 200)
                if status_code >= 400:
                    payload = file_result.get("data") or {}
                    error_code = str(payload.get("error") or "").upper()
                    if error_code == "NO_SALES_FOR_PERIOD":
                        start_text = _fmt_dt(payload.get("start_date"))
                        end_text = _fmt_dt(payload.get("end_date"))
                        period_title = _tr(
                            locale,
                            "mes" if period == "month" else "semana",
                            "month" if period == "month" else "week",
                        )
                        await _edit_panel_message(
                            callback.message,
                            _tr(
                                locale,
                                "ℹ️ <b>Aún no hay ventas</b> para descargar en el "
                                f"<b>{period_title}</b> seleccionado.\n\n"
                                f"Rango: <b>{_escape_html(start_text)} - {_escape_html(end_text)}</b>",
                                "ℹ️ <b>There are no sales yet</b> to download for the selected "
                                f"<b>{period_title}</b>.\n\n"
                                f"Range: <b>{_escape_html(start_text)} - {_escape_html(end_text)}</b>",
                            ),
                            reply_markup=_build_earnings_csv_picker_keyboard(
                                month_offset,
                                week_offset,
                                locale,
                            ),
                        )
                        return
                    await _edit_panel_message(
                        callback.message,
                        _tr(
                            locale,
                            "❌ <b>No se pudo generar el archivo.</b>",
                            "❌ <b>Could not generate the file.</b>",
                        ),
                        reply_markup=_build_earnings_csv_picker_keyboard(
                            month_offset,
                            week_offset,
                            locale,
                        ),
                    )
                    return
                content = file_result.get("content") or b""
                if isinstance(content, str):
                    content = content.encode("utf-8")
                default_ext = "xlsx" if wants_xlsx else "csv"
                filename = str(file_result.get("filename") or f"ganancias-{period}.{default_ext}")
                document = BufferedInputFile(content, filename=filename)
                await callback.message.answer_document(
                    document=document,
                    caption=_tr(
                        locale,
                        "✅ Archivo generado correctamente.",
                        "✅ File generated successfully.",
                    ),
                )
                earnings_text, earnings_keyboard = await _build_sales_insights_view(
                    month_offset=month_offset,
                    week_offset=week_offset,
                    locale=locale,
                )
                await _edit_panel_message(
                    callback.message,
                    earnings_text,
                    reply_markup=earnings_keyboard,
                )
                return

            await _edit_panel_message(
                callback.message,
                _tr(
                    locale,
                    "⚠️ Acción de CSV inválida.",
                    "⚠️ Invalid CSV action.",
                ),
                reply_markup=_build_back_to_panel_keyboard(locale),
            )
            return

        if action == "topsales":
            await state.clear()
            requested_month_offset = _safe_offset(parts[2] if len(parts) > 2 else 0)
            top_text, top_keyboard = await _build_top_products_month_view(
                limit=5,
                month_offset=requested_month_offset,
                locale=locale,
            )
            await _edit_panel_message(
                callback.message,
                top_text,
                reply_markup=top_keyboard,
            )
            return

        if action == "orders":
            if len(parts) >= 4 and parts[2] == "list":
                limit = _safe_int(parts[3], 10, 1, 30)
                await state.clear()
                await _edit_panel_message(
                    callback.message,
                    await _build_orders_pending_text(limit, locale),
                    reply_markup=_build_orders_limit_keyboard(locale),
                )
            else:
                await state.clear()
                await _edit_panel_message(
                    callback.message,
                    _guide_text("orders", locale),
                    reply_markup=_build_orders_limit_keyboard(locale),
                )
            return

        if action == "order":
            await state.set_state(AdminUiStates.awaiting_value)
            await state.update_data(admin_ui_action="order_ref_view", **panel_anchor)
            await _edit_panel_message(
                callback.message,
                _guide_text("order", locale),
                reply_markup=_build_back_to_panel_keyboard(locale),
            )
            return

        if action == "approve":
            await state.set_state(AdminUiStates.awaiting_value)
            await state.update_data(admin_ui_action="order_ref_approve", **panel_anchor)
            await _edit_panel_message(
                callback.message,
                _guide_text("approve", locale),
                reply_markup=_build_back_to_panel_keyboard(locale),
            )
            return

        if action == "reject":
            await state.set_state(AdminUiStates.awaiting_value)
            await state.update_data(admin_ui_action="order_ref_reject", **panel_anchor)
            await _edit_panel_message(
                callback.message,
                _guide_text("reject", locale),
                reply_markup=_build_back_to_panel_keyboard(locale),
            )
            return

        if action == "refund":
            await state.set_state(AdminUiStates.awaiting_value)
            await state.update_data(admin_ui_action="order_ref_refund", **panel_anchor)
            await _edit_panel_message(
                callback.message,
                _guide_text("refund", locale),
                reply_markup=_build_back_to_panel_keyboard(locale),
            )
            return

        if action == "ban":
            await state.set_state(AdminUiStates.awaiting_value)
            await state.update_data(admin_ui_action="ban_telegram_id", **panel_anchor)
            await _edit_panel_message(
                callback.message,
                _guide_text("ban", locale),
                reply_markup=_build_back_to_panel_keyboard(locale),
            )
            return

        if action == "unban":
            await state.set_state(AdminUiStates.awaiting_value)
            await state.update_data(admin_ui_action="unban_telegram_id", **panel_anchor)
            await _edit_panel_message(
                callback.message,
                _guide_text("unban", locale),
                reply_markup=_build_back_to_panel_keyboard(locale),
            )
            return

        if action == "maint":
            if len(parts) >= 4 and parts[2] == "set":
                active = parts[3].lower() == "on"
                await state.clear()
                response = await api_client.admin_set_maintenance(active)
                state_text = (
                    _tr(locale, "ACTIVO", "ON")
                    if response.get("active")
                    else _tr(locale, "INACTIVO", "OFF")
                )
                await _edit_panel_message(
                    callback.message,
                    _tr(
                        locale,
                        "🛠 <b>Mantenimiento actualizado</b>\n\n"
                        f"Estado actual: <b>{state_text}</b>",
                        "🛠 <b>Maintenance updated</b>\n\n"
                        f"Current state: <b>{state_text}</b>",
                    ),
                    reply_markup=_build_maint_keyboard(locale),
                )
            else:
                await state.clear()
                await _edit_panel_message(
                    callback.message,
                    _guide_text("maint", locale),
                    reply_markup=_build_maint_keyboard(locale),
                )
            return

        if action == "broadcast":
            sub_action = parts[2] if len(parts) > 2 else ""
            if not sub_action:
                await state.clear()
                await _edit_panel_message(
                    callback.message,
                    _build_broadcast_menu_text(locale),
                    reply_markup=_build_broadcast_menu_keyboard(locale),
                )
                return

            if sub_action == "new":
                await state.set_state(AdminUiStates.awaiting_value)
                await state.update_data(
                    admin_ui_action="broadcast_text",
                    admin_ui_selected_saved_broadcast_id="",
                    admin_ui_saved_broadcast_signature="",
                    admin_ui_saved_broadcast_ids=[],
                    **panel_anchor,
                )
                await _edit_panel_message(
                    callback.message,
                    _guide_text("broadcast", locale),
                    reply_markup=_build_back_to_panel_keyboard(locale),
                )
                return

            if sub_action == "saved":
                mode = str(parts[3] if len(parts) > 3 else "").strip().lower()
                if mode == "page":
                    page = _safe_int(parts[4] if len(parts) > 4 else "1", 1, 1, 999)
                    text, keyboard, saved_ids = await _build_saved_broadcasts_view(locale, page=page)
                    await state.update_data(
                        admin_ui_saved_broadcast_ids=saved_ids,
                        admin_ui_saved_broadcast_page=page,
                        admin_ui_selected_saved_broadcast_id="",
                        **panel_anchor,
                    )
                    await _edit_panel_message(callback.message, text, reply_markup=keyboard)
                    return

                if mode == "pick":
                    data = await state.get_data()
                    saved_ids = data.get("admin_ui_saved_broadcast_ids") or []
                    index = _safe_int(parts[4] if len(parts) > 4 else "0", 0, 0, 99)
                    if index <= 0 or index > len(saved_ids):
                        page = _safe_int(data.get("admin_ui_saved_broadcast_page"), 1, 1, 999)
                        text, keyboard, saved_ids = await _build_saved_broadcasts_view(locale, page=page)
                        await state.update_data(
                            admin_ui_saved_broadcast_ids=saved_ids,
                            admin_ui_saved_broadcast_page=page,
                            admin_ui_selected_saved_broadcast_id="",
                            **panel_anchor,
                        )
                        await _edit_panel_message(callback.message, text, reply_markup=keyboard)
                        return
                    broadcast_id = str(saved_ids[index - 1] or "").strip()
                    broadcast = await _load_saved_broadcast_for_state(state, broadcast_id)
                    await state.update_data(**panel_anchor)
                    await _edit_panel_message(
                        callback.message,
                        _build_saved_broadcast_detail_text(broadcast, locale),
                        reply_markup=_build_saved_broadcast_actions_keyboard(locale),
                    )
                    return

                if mode == "preview":
                    data = await state.get_data()
                    broadcast_id = str(data.get("admin_ui_selected_saved_broadcast_id") or "").strip()
                    if not broadcast_id:
                        page = _safe_int(data.get("admin_ui_saved_broadcast_page"), 1, 1, 999)
                        text, keyboard, saved_ids = await _build_saved_broadcasts_view(locale, page=page)
                        await state.update_data(
                            admin_ui_saved_broadcast_ids=saved_ids,
                            admin_ui_saved_broadcast_page=page,
                            **panel_anchor,
                        )
                        await _edit_panel_message(callback.message, text, reply_markup=keyboard)
                        return
                    broadcast = await _load_saved_broadcast_for_state(state, broadcast_id)
                    buttons = _normalize_broadcast_buttons_state(broadcast.get("buttons"))
                    media_file_id, media_kind = _extract_saved_broadcast_media(broadcast)
                    await _send_broadcast_preview_message(
                        callback.message,
                        str(broadcast.get("message_text") or "").strip(),
                        buttons,
                        media_file_id,
                        media_kind,
                        _normalize_broadcast_message_entities(broadcast.get("message_entities")),
                        locale=locale,
                    )
                    await callback.answer(_tr(locale, "Vista previa enviada.", "Preview sent."))
                    return

                if mode == "send":
                    data = await state.get_data()
                    broadcast_id = str(data.get("admin_ui_selected_saved_broadcast_id") or "").strip()
                    if not broadcast_id:
                        page = _safe_int(data.get("admin_ui_saved_broadcast_page"), 1, 1, 999)
                        text, keyboard, saved_ids = await _build_saved_broadcasts_view(locale, page=page)
                        await state.update_data(
                            admin_ui_saved_broadcast_ids=saved_ids,
                            admin_ui_saved_broadcast_page=page,
                            **panel_anchor,
                        )
                        await _edit_panel_message(callback.message, text, reply_markup=keyboard)
                        return
                    broadcast = await _load_saved_broadcast_for_state(state, broadcast_id)
                    buttons = _normalize_broadcast_buttons_state(broadcast.get("buttons"))
                    media_kind = _saved_broadcast_media_kind(broadcast)
                    await api_client.admin_send_broadcast_async(broadcast_id)
                    text = await _wait_broadcast_progress_and_build_result(
                        callback.message,
                        broadcast_id,
                        locale,
                        buttons=buttons,
                        media_kind=media_kind,
                    )
                    await state.clear()
                    await _edit_panel_message(
                        callback.message,
                        text,
                        reply_markup=_build_back_to_panel_keyboard(locale),
                    )
                    return

                if mode == "edit":
                    field = str(parts[4] if len(parts) > 4 else "").lower()
                    data = await state.get_data()
                    broadcast_id = str(data.get("admin_ui_selected_saved_broadcast_id") or "").strip()
                    if not broadcast_id:
                        page = _safe_int(data.get("admin_ui_saved_broadcast_page"), 1, 1, 999)
                        text, keyboard, saved_ids = await _build_saved_broadcasts_view(locale, page=page)
                        await state.update_data(
                            admin_ui_saved_broadcast_ids=saved_ids,
                            admin_ui_saved_broadcast_page=page,
                            **panel_anchor,
                        )
                        await _edit_panel_message(callback.message, text, reply_markup=keyboard)
                        return
                    await _load_saved_broadcast_for_state(state, broadcast_id)
                    await state.set_state(AdminUiStates.awaiting_value)
                    await state.update_data(**panel_anchor)
                    if field == "text":
                        await state.update_data(admin_ui_action="broadcast_review_edit_text")
                        await _edit_panel_message(
                            callback.message,
                            _tr(
                                locale,
                                "✏️ <b>Editar texto de difusión</b>\n\nEnvía solo el nuevo texto. "
                                "Se mantendrán tus botones y multimedia actuales.",
                                "✏️ <b>Edit broadcast text</b>\n\nSend only the new text. "
                                "Your current buttons and media will be preserved.",
                            ),
                            reply_markup=_build_back_to_panel_keyboard(locale),
                        )
                        return
                    if field == "buttons":
                        await state.update_data(admin_ui_action="broadcast_review_edit_buttons")
                        await _edit_panel_message(
                            callback.message,
                            _tr(
                                locale,
                                "🔗 <b>Editar botones de difusión</b>\n\n"
                                "Envía solo los botones nuevos.\n"
                                "Se mantendrán tu texto y multimedia actuales.\n\n"
                                + _build_broadcast_buttons_prompt_text(locale),
                                "🔗 <b>Edit broadcast buttons</b>\n\n"
                                "Send only the new buttons.\n"
                                "Your current text and media will be preserved.\n\n"
                                + _build_broadcast_buttons_prompt_text(locale),
                            ),
                            reply_markup=_build_back_to_panel_keyboard(locale),
                        )
                        return
                    if field == "media":
                        await state.update_data(admin_ui_action="broadcast_review_edit_media")
                        await _edit_panel_message(
                            callback.message,
                            _tr(
                                locale,
                                "🖼 <b>Editar multimedia de difusión</b>\n\n"
                                "Envía una imagen, GIF o video para reemplazarla.\n"
                                "Escribe <code>sin</code> para quitarla.\n"
                                "Escribe <code>saltar</code> para mantener la actual.\n"
                                "Se mantendrán tu texto y botones actuales.",
                                "🖼 <b>Edit broadcast media</b>\n\n"
                                "Send an image, GIF or video to replace it.\n"
                                "Type <code>none</code> to remove it.\n"
                                "Type <code>skip</code> to keep current media.\n"
                                "Your current text and buttons will be preserved.",
                            ),
                            reply_markup=_build_back_to_panel_keyboard(locale),
                        )
                        return

                if mode == "delete":
                    data = await state.get_data()
                    broadcast_id = str(data.get("admin_ui_selected_saved_broadcast_id") or "").strip()
                    page = _safe_int(data.get("admin_ui_saved_broadcast_page"), 1, 1, 999)
                    if broadcast_id:
                        await api_client.admin_delete_broadcast(broadcast_id)
                    text, keyboard, saved_ids = await _build_saved_broadcasts_view(locale, page=page)
                    await state.update_data(
                        admin_ui_saved_broadcast_ids=saved_ids,
                        admin_ui_saved_broadcast_page=page,
                        admin_ui_selected_saved_broadcast_id="",
                        admin_ui_saved_broadcast_signature="",
                        **panel_anchor,
                    )
                    success_header = _tr(
                        locale,
                        "🗑 <b>Difusión eliminada.</b>\n\n",
                        "🗑 <b>Broadcast deleted.</b>\n\n",
                    )
                    await _edit_panel_message(
                        callback.message,
                        success_header + text,
                        reply_markup=keyboard,
                    )
                    return

                page = _safe_int(parts[4] if len(parts) > 4 else "1", 1, 1, 999)
                text, keyboard, saved_ids = await _build_saved_broadcasts_view(locale, page=page)
                await state.update_data(
                    admin_ui_saved_broadcast_ids=saved_ids,
                    admin_ui_saved_broadcast_page=page,
                    admin_ui_selected_saved_broadcast_id="",
                    **panel_anchor,
                )
                await _edit_panel_message(callback.message, text, reply_markup=keyboard)
                return

            if sub_action == "preview":
                mode = str(parts[3] if len(parts) > 3 else "").lower()
                if mode == "close":
                    try:
                        await callback.message.delete()
                    except Exception:
                        pass
                    await callback.answer(_tr(locale, "Vista previa cerrada.", "Preview closed."))
                    return

            if sub_action == "skip":
                step = str(parts[3] if len(parts) > 3 else "").lower()
                data = await state.get_data()
                message_text = str(data.get("admin_ui_broadcast_text") or "").strip()
                message_plain_text = str(
                    data.get("admin_ui_broadcast_plain_text") or data.get("admin_ui_broadcast_text") or ""
                ).strip()
                if not message_text:
                    await state.set_state(AdminUiStates.awaiting_value)
                    await state.update_data(admin_ui_action="broadcast_text", **panel_anchor)
                    await _edit_panel_message(
                        callback.message,
                        _guide_text("broadcast", locale),
                        reply_markup=_build_back_to_panel_keyboard(locale),
                    )
                    return

                buttons = _normalize_broadcast_buttons_state(
                    data.get("admin_ui_broadcast_buttons")
                )
                if step == "buttons":
                    await state.set_state(AdminUiStates.awaiting_value)
                    await state.update_data(
                        admin_ui_action="broadcast_media",
                        admin_ui_broadcast_buttons=[],
                        **panel_anchor,
                    )
                    await _edit_panel_message(
                        callback.message,
                        _build_broadcast_media_prompt_text(locale),
                        reply_markup=_build_broadcast_step_keyboard("media", locale),
                    )
                    return
                if step == "media":
                    await state.set_state(AdminUiStates.awaiting_value)
                    await state.update_data(
                        admin_ui_action="broadcast_review",
                        admin_ui_broadcast_buttons=buttons,
                        admin_ui_broadcast_media_file_id="",
                        admin_ui_broadcast_media_kind="",
                        **panel_anchor,
                    )
                    await _edit_panel_message(
                        callback.message,
                        _build_broadcast_review_text(
                            message_text,
                            buttons,
                            None,
                            locale,
                        ),
                        reply_markup=_build_broadcast_review_keyboard(locale),
                    )
                    return

            if sub_action == "review":
                mode = str(parts[3] if len(parts) > 3 else "").lower()
                data = await state.get_data()
                message_text = str(data.get("admin_ui_broadcast_text") or "").strip()
                message_plain_text = str(
                    data.get("admin_ui_broadcast_plain_text") or data.get("admin_ui_broadcast_text") or ""
                ).strip()
                if not message_text:
                    await state.set_state(AdminUiStates.awaiting_value)
                    await state.update_data(admin_ui_action="broadcast_text", **panel_anchor)
                    await _edit_panel_message(
                        callback.message,
                        _guide_text("broadcast", locale),
                        reply_markup=_build_back_to_panel_keyboard(locale),
                    )
                    return

                buttons = _normalize_broadcast_buttons_state(
                    data.get("admin_ui_broadcast_buttons")
                )
                message_entities = _normalize_broadcast_message_entities(
                    data.get("admin_ui_broadcast_entities")
                )
                media_file_id = str(data.get("admin_ui_broadcast_media_file_id") or "").strip()
                media_kind = str(data.get("admin_ui_broadcast_media_kind") or "").strip().lower()
                if mode == "preview":
                    await _send_broadcast_preview_message(
                        callback.message,
                        message_text,
                        buttons,
                        media_file_id or None,
                        media_kind or None,
                        message_entities,
                        locale=locale,
                    )
                    await callback.answer(_tr(locale, "Vista previa enviada.", "Preview sent."))
                    return

                if mode == "send":
                    text = await _send_broadcast_with_progress(
                        callback.message,
                        message_plain_text,
                        locale=locale,
                        buttons=buttons,
                        media_file_id=media_file_id or None,
                        media_kind=media_kind or None,
                        message_entities=message_entities,
                    )
                    await state.clear()
                    await _edit_panel_message(
                        callback.message,
                        text,
                        reply_markup=_build_back_to_panel_keyboard(locale),
                    )
                    return

                if mode == "save":
                    saved_text = await _save_current_broadcast_draft(state, locale)
                    review_text = _build_broadcast_review_text(
                        message_text,
                        buttons,
                        media_kind or None,
                        locale,
                    )
                    await _edit_panel_message(
                        callback.message,
                        f"{saved_text}\n\n{review_text}",
                        reply_markup=_build_broadcast_review_keyboard(locale),
                    )
                    return

                if mode == "edit":
                    field = str(parts[4] if len(parts) > 4 else "").lower()
                    await state.set_state(AdminUiStates.awaiting_value)
                    if field == "text":
                        await state.update_data(admin_ui_action="broadcast_review_edit_text", **panel_anchor)
                        await _edit_panel_message(
                            callback.message,
                            _tr(
                                locale,
                                "✏️ <b>Editar texto de difusión</b>\n\nEnvía solo el nuevo texto. "
                                "Se mantendrán tus botones y multimedia actuales.",
                                "✏️ <b>Edit broadcast text</b>\n\nSend only the new text. "
                                "Your current buttons and media will be preserved.",
                            ),
                            reply_markup=_build_back_to_panel_keyboard(locale),
                        )
                        return
                    if field == "buttons":
                        await state.update_data(admin_ui_action="broadcast_review_edit_buttons", **panel_anchor)
                        await _edit_panel_message(
                            callback.message,
                            _tr(
                                locale,
                                "🔗 <b>Editar botones de difusión</b>\n\n"
                                "Envía solo los botones nuevos.\n"
                                "Se mantendrán tu texto y multimedia actuales.\n\n"
                                + _build_broadcast_buttons_prompt_text(locale),
                                "🔗 <b>Edit broadcast buttons</b>\n\n"
                                "Send only the new buttons.\n"
                                "Your current text and media will be preserved.\n\n"
                                + _build_broadcast_buttons_prompt_text(locale),
                            ),
                            reply_markup=_build_back_to_panel_keyboard(locale),
                        )
                        return
                    if field == "media":
                        await state.update_data(admin_ui_action="broadcast_review_edit_media", **panel_anchor)
                        await _edit_panel_message(
                            callback.message,
                            _tr(
                                locale,
                                "🖼 <b>Editar multimedia de difusión</b>\n\n"
                                "Envía una imagen, GIF o video para reemplazarla.\n"
                                "Escribe <code>sin</code> para quitarla.\n"
                                "Escribe <code>saltar</code> para mantener la actual.\n"
                                "Se mantendrán tu texto y botones actuales.",
                                "🖼 <b>Edit broadcast media</b>\n\n"
                                "Send an image, GIF or video to replace it.\n"
                                "Type <code>none</code> to remove it.\n"
                                "Type <code>skip</code> to keep current media.\n"
                                "Your current text and buttons will be preserved.",
                            ),
                            reply_markup=_build_back_to_panel_keyboard(locale),
                        )
                        return

            await _edit_panel_message(
                callback.message,
                _build_broadcast_menu_text(locale),
                reply_markup=_build_broadcast_menu_keyboard(locale),
            )
            return

        if action == "logs":
            if len(parts) >= 5 and parts[2] == "list":
                category = parts[3].lower()
                if category not in {"errors", "payments", "support"}:
                    await _edit_panel_message(
                        callback.message,
                        _tr(locale, "❌ <b>Categoría inválida.</b>", "❌ <b>Invalid category.</b>"),
                        reply_markup=_build_logs_keyboard(locale),
                    )
                    return
                limit = _safe_int(parts[4], 10, 1, 25)
                await state.clear()
                await _edit_panel_message(
                    callback.message,
                    await _build_logs_text(category, limit, locale),
                    reply_markup=_build_logs_keyboard(locale),
                )
            else:
                await state.clear()
                await _edit_panel_message(
                    callback.message,
                    _guide_text("logs", locale),
                    reply_markup=_build_logs_keyboard(locale),
                )
            return

        if action == "homecfg":
            mode = parts[2] if len(parts) > 2 else ""
            if mode == "text":
                await state.clear()
                await _edit_panel_message(
                    callback.message,
                    _tr(
                        locale,
                        "📝 <b>Editar texto Home</b>\n\nSelecciona el idioma a editar:",
                        "📝 <b>Edit Home text</b>\n\nSelect the language to edit:",
                    ),
                    reply_markup=_build_home_locale_keyboard("textloc", locale),
                )
                return

            if mode == "textloc":
                locale_target = str(parts[3] if len(parts) > 3 else "").lower()
                if locale_target not in _HOME_LAYOUT_LOCALES:
                    await _edit_panel_message(
                        callback.message,
                        _tr(locale, "❌ <b>Idioma inválido.</b>", "❌ <b>Invalid language.</b>"),
                        reply_markup=_build_home_locale_keyboard("textloc", locale),
                    )
                    return
                await state.set_state(AdminUiStates.awaiting_value)
                await state.update_data(
                    admin_ui_action="homecfg_text_value",
                    admin_ui_home_locale=locale_target,
                    **panel_anchor,
                )
                await _edit_panel_message(
                    callback.message,
                    _tr(
                        locale,
                        f"📝 <b>Texto Home ({_home_locale_title(locale_target, locale)})</b>\n\n"
                        "Envía el nuevo texto completo del home.\n"
                        "Puedes usar formato HTML básico.",
                        f"📝 <b>Home text ({_home_locale_title(locale_target, locale)})</b>\n\n"
                        "Send the new full home text.\n"
                        "You can use basic HTML format.",
                    ),
                    reply_markup=_build_back_to_panel_keyboard(locale),
                )
                return

            if mode == "buttons":
                await state.clear()
                await _edit_panel_message(
                    callback.message,
                    _tr(
                        locale,
                        "🎛 <b>Editar botones Home</b>\n\nSelecciona el idioma a editar:",
                        "🎛 <b>Edit Home buttons</b>\n\nSelect the language to edit:",
                    ),
                    reply_markup=_build_home_locale_keyboard("btnloc", locale),
                )
                return

            if mode == "btnloc":
                locale_target = str(parts[3] if len(parts) > 3 else "").lower()
                if locale_target not in _HOME_LAYOUT_LOCALES:
                    await _edit_panel_message(
                        callback.message,
                        _tr(locale, "❌ <b>Idioma inválido.</b>", "❌ <b>Invalid language.</b>"),
                        reply_markup=_build_home_locale_keyboard("btnloc", locale),
                    )
                    return
                layout = await _load_home_layout()
                await state.clear()
                await state.update_data(
                    admin_ui_home_locale=locale_target,
                    admin_ui_home_layout=layout,
                    **panel_anchor,
                )
                await _edit_panel_message(
                    callback.message,
                    _build_home_buttons_panel_text(layout, locale_target, locale),
                    reply_markup=_build_home_buttons_ops_keyboard(locale_target, locale),
                )
                return

            if mode == "btnop":
                operation = str(parts[3] if len(parts) > 3 else "").lower()
                data = await state.get_data()
                locale_target = str(data.get("admin_ui_home_locale") or "").lower()
                if locale_target not in _HOME_LAYOUT_LOCALES:
                    await _edit_panel_message(
                        callback.message,
                        _tr(
                            locale,
                            "⚠️ Primero selecciona el idioma de botones.",
                            "⚠️ Select the button language first.",
                        ),
                        reply_markup=_build_home_locale_keyboard("btnloc", locale),
                    )
                    return
                if operation not in {"rename", "add", "delete", "move", "solo"}:
                    await _edit_panel_message(
                        callback.message,
                        _tr(locale, "❌ <b>Operación inválida.</b>", "❌ <b>Invalid operation.</b>"),
                        reply_markup=_build_home_buttons_ops_keyboard(locale_target, locale),
                    )
                    return
                action_map = {
                    "rename": "homecfg_btn_rename",
                    "add": "homecfg_btn_add",
                    "delete": "homecfg_btn_delete",
                    "move": "homecfg_btn_move",
                    "solo": "homecfg_btn_solo",
                }
                await state.set_state(AdminUiStates.awaiting_value)
                await state.update_data(
                    admin_ui_action=action_map[operation],
                    admin_ui_home_locale=locale_target,
                    **panel_anchor,
                )
                if operation == "rename":
                    prompt = _tr(
                        locale,
                        "✏️ <b>Renombrar botón</b>\n\nFormato: <code>numero | nuevo texto</code>",
                        "✏️ <b>Rename button</b>\n\nFormat: <code>number | new label</code>",
                    )
                elif operation == "add":
                    prompt = _tr(
                        locale,
                        "➕ <b>Agregar botón</b>\n\n"
                        "Formato básico: <code>texto | callback_data</code>\n"
                        "Formato con posición: <code>texto | callback_data | fila | posicion(1-2) | modo(correr|estricto)</code>\n"
                        "Ejemplo: <code>🔥 Promos | category:page:metodos | 2 | 1 | correr</code>",
                        "➕ <b>Add button</b>\n\n"
                        "Basic format: <code>label | callback_data</code>\n"
                        "With position: <code>label | callback_data | row | position(1-2) | mode(shift|strict)</code>\n"
                        "Example: <code>🔥 Deals | category:page:metodos | 2 | 1 | shift</code>",
                    )
                elif operation == "move":
                    prompt = _tr(
                        locale,
                        "📍 <b>Mover botón</b>\n\nFormato: <code>numero | fila | posicion(1-2) | modo(correr|estricto)</code>",
                        "📍 <b>Move button</b>\n\nFormat: <code>number | row | position(1-2) | mode(shift|strict)</code>",
                    )
                elif operation == "solo":
                    prompt = _tr(
                        locale,
                        "🧱 <b>Poner en fila sola</b>\n\nFormato: <code>numero | fila</code>",
                        "🧱 <b>Put in solo row</b>\n\nFormat: <code>number | row</code>",
                    )
                else:
                    prompt = _tr(
                        locale,
                        "🗑 <b>Eliminar botón</b>\n\nFormato: <code>numero</code>",
                        "🗑 <b>Delete button</b>\n\nFormat: <code>number</code>",
                    )
                await _edit_panel_message(
                    callback.message,
                    prompt,
                    reply_markup=_build_back_to_panel_keyboard(locale),
                )
                return

            if mode == "btnreset":
                locale_target = str(parts[3] if len(parts) > 3 else "").lower()
                if locale_target not in _HOME_LAYOUT_LOCALES:
                    await _edit_panel_message(
                        callback.message,
                        _tr(locale, "❌ <b>Idioma inválido.</b>", "❌ <b>Invalid language.</b>"),
                        reply_markup=_build_home_locale_keyboard("btnloc", locale),
                    )
                    return
                layout = await _load_home_layout()
                layout[locale_target]["buttons"] = _default_home_button_rows(locale_target)
                saved = await _save_home_layout(layout)
                await state.clear()
                await state.update_data(
                    admin_ui_home_locale=locale_target,
                    admin_ui_home_layout=saved,
                    **panel_anchor,
                )
                await _edit_panel_message(
                    callback.message,
                    _tr(
                        locale,
                        "♻️ <b>Botones restaurados.</b>\n\n",
                        "♻️ <b>Buttons restored.</b>\n\n",
                    ) + _build_home_buttons_panel_text(saved, locale_target, locale),
                    reply_markup=_build_home_buttons_ops_keyboard(locale_target, locale),
                )
                return

        if action == "product":
            sub_action = parts[2] if len(parts) > 2 else "home"
            if sub_action == "add":
                await state.set_state(AdminUiStates.awaiting_value)
                await state.update_data(admin_ui_action="product_create_base", **panel_anchor)
                await _edit_panel_message(
                    callback.message,
                    _guide_text("product_add", locale),
                    reply_markup=None,
                )
                return
            if sub_action == "delete":
                mode = parts[3] if len(parts) > 3 else ""
                if mode == "cat":
                    category_key = _normalize_category_key(parts[4] if len(parts) > 4 else "")
                    if not category_key:
                        await _edit_panel_message(
                            callback.message,
                            _tr(locale, "❌ <b>Categoría inválida.</b>", "❌ <b>Invalid category.</b>"),
                            reply_markup=await _build_delete_categories_keyboard(locale),
                        )
                        return
                    await state.clear()
                    await state.update_data(
                        admin_ui_delete_category=category_key,
                        admin_ui_delete_product_id="",
                        **panel_anchor,
                    )
                    text, keyboard = await _build_product_delete_view(
                        category_key=category_key,
                        locale=locale,
                    )
                    await _edit_panel_message(callback.message, text, reply_markup=keyboard)
                    return
                if mode == "item":
                    product_id = parts[4] if len(parts) > 4 else ""
                    data = await state.get_data()
                    category_key = _normalize_category_key(data.get("admin_ui_delete_category")) or "TIENDA"
                    if not product_id:
                        await _edit_panel_message(
                            callback.message,
                            _tr(locale, "❌ <b>Producto inválido.</b>", "❌ <b>Invalid product.</b>"),
                            reply_markup=await _build_delete_categories_keyboard(locale),
                        )
                        return
                    product = await _find_active_product_by_id(product_id, category_key)
                    if not product:
                        text, keyboard = await _build_product_delete_view(
                            category_key=category_key,
                            header=_tr(
                                locale,
                                "⚠️ <b>Ese producto ya no está disponible.</b>",
                                "⚠️ <b>That product is no longer available.</b>",
                            ),
                            locale=locale,
                        )
                        await _edit_panel_message(callback.message, text, reply_markup=keyboard)
                        return
                    product_name = _escape_html(product.get("name") or "Producto")
                    await state.update_data(
                        admin_ui_delete_category=category_key,
                        admin_ui_delete_product_id=product_id,
                        **panel_anchor,
                    )
                    confirm_text = _tr(
                        locale,
                        "⚠️ <b>Confirmar eliminación</b>\n\n"
                        f"¿Seguro que quieres eliminar <b>{product_name}</b>?\n\n"
                        "Si el producto no tiene órdenes, se borrará de la base de datos.\n"
                        "Si ya tuvo órdenes, se desactivará.",
                        "⚠️ <b>Confirm deletion</b>\n\n"
                        f"Are you sure you want to delete <b>{product_name}</b>?\n\n"
                        "If the product has no orders, it will be deleted from the database.\n"
                        "If it already has orders, it will be deactivated.",
                    )
                    await _edit_panel_message(
                        callback.message,
                        confirm_text,
                        reply_markup=_build_delete_confirm_keyboard(locale),
                    )
                    return
                if mode == "confirm":
                    data = await state.get_data()
                    product_id = str(data.get("admin_ui_delete_product_id") or "").strip()
                    category_key = _normalize_category_key(data.get("admin_ui_delete_category")) or "TIENDA"
                    if not product_id:
                        await _edit_panel_message(
                            callback.message,
                            _tr(locale, "❌ <b>Producto inválido.</b>", "❌ <b>Invalid product.</b>"),
                            reply_markup=await _build_delete_categories_keyboard(locale),
                        )
                        return
                    result = await api_client.admin_deactivate_product(product_id)
                    await state.update_data(
                        admin_ui_delete_product_id="",
                        admin_ui_delete_category=category_key,
                        **panel_anchor,
                    )
                    result_action = str(result.get("action") or "").strip().lower()
                    if result_action == "deleted":
                        header_text = _tr(
                            locale,
                            "✅ <b>Producto eliminado definitivamente.</b>",
                            "✅ <b>Product permanently deleted.</b>",
                        )
                    elif result_action == "deactivated":
                        header_text = _tr(
                            locale,
                            "✅ <b>Producto desactivado porque ya tenía órdenes.</b>",
                            "✅ <b>Product deactivated because it already had orders.</b>",
                        )
                    else:
                        header_text = _tr(
                            locale,
                            "✅ <b>Producto procesado correctamente.</b>",
                            "✅ <b>Product processed successfully.</b>",
                        )
                    text, keyboard = await _build_product_delete_view(
                        category_key=category_key,
                        header=header_text,
                        locale=locale,
                    )
                    await _edit_panel_message(callback.message, text, reply_markup=keyboard)
                    return
                if mode == "cancel":
                    category_key = _normalize_category_key(parts[4] if len(parts) > 4 else "")
                    if not category_key:
                        category_key = _normalize_category_key(
                            (await state.get_data()).get("admin_ui_delete_category")
                        ) or "TIENDA"
                    await state.update_data(
                        admin_ui_delete_product_id="",
                        admin_ui_delete_category=category_key,
                        **panel_anchor,
                    )
                    text, keyboard = await _build_product_delete_view(
                        category_key=category_key,
                        header=_tr(
                            locale,
                            "👌 <b>Eliminación cancelada.</b>",
                            "👌 <b>Deletion cancelled.</b>",
                        ),
                        locale=locale,
                    )
                    await _edit_panel_message(callback.message, text, reply_markup=keyboard)
                    return
                await state.clear()
                await state.update_data(**panel_anchor)
                await _edit_panel_message(
                    callback.message,
                    _guide_text("product_delete", locale),
                    reply_markup=await _build_delete_categories_keyboard(locale),
                )
                return

        await _edit_panel_message(
            callback.message,
            _build_admin_panel_text(locale),
            reply_markup=_build_admin_panel_keyboard(locale),
        )
    except httpx.HTTPStatusError as exc:
        try:
            payload = exc.response.json()
        except Exception:
            payload = {}
        error_code = payload.get("error") if isinstance(payload, dict) else None
        if error_code == "ORDER_NOT_FOUND":
            text = _build_order_not_found_text(payload, locale)
        else:
            text = _tr(
                locale,
                "❌ <b>Error en la acción del panel</b>\n\n"
                f"Código: <b>{exc.response.status_code}</b>\n"
                f"Detalle: <code>{_escape_html(error_code or 'ERROR')}</code>",
                "❌ <b>Panel action error</b>\n\n"
                f"Code: <b>{exc.response.status_code}</b>\n"
                f"Detail: <code>{_escape_html(error_code or 'ERROR')}</code>",
            )
        await _edit_panel_message(
            callback.message,
            text,
            reply_markup=_build_admin_panel_keyboard(locale),
        )
    except Exception as exc:
        await _edit_panel_message(
            callback.message,
            _tr(
                locale,
                "❌ <b>Error del panel admin</b>\n\n"
                f"<code>{_escape_html(exc)}</code>",
                "❌ <b>Admin panel error</b>\n\n"
                f"<code>{_escape_html(exc)}</code>",
            ),
            reply_markup=_build_admin_panel_keyboard(locale),
        )
    finally:
        await callback.answer()


@router.message(AdminUiStates.awaiting_value)
async def handle_admin_ui_value(message: Message, state: FSMContext) -> None:
    locale = await _admin_guard(message)
    if not locale:
        return
    if not await _ensure_admin_http(message):
        return

    plain_text = (message.text or message.caption or "").strip()
    raw_text = _extract_message_html_text(message)
    message_entities = _extract_message_entities(message)
    photo_file_id = message.photo[-1].file_id if message.photo else ""
    animation_file_id = message.animation.file_id if message.animation else ""
    video_file_id = message.video.file_id if message.video else ""
    data = await state.get_data()
    action = str(data.get("admin_ui_action") or "").strip()
    if action in {"broadcast_buttons", "broadcast_review_edit_buttons"}:
        raw_text = plain_text
    panel_resume: Dict[str, Any] = {}
    panel_chat_id = data.get("admin_ui_panel_chat_id")
    panel_message_id = data.get("admin_ui_panel_message_id")
    if panel_chat_id is not None:
        panel_resume["admin_ui_panel_chat_id"] = panel_chat_id
    if panel_message_id is not None:
        panel_resume["admin_ui_panel_message_id"] = panel_message_id

    try:
        if raw_text.lower() in {"/cancel", "cancel", "salir"}:
            await state.clear()
            if message.from_user:
                await render_home_view(message, message.from_user.id, locale)
            return

        allows_media_input = action in {
            "product_create_image",
            "broadcast_media",
            "broadcast_review_edit_media",
        }
        if not allows_media_input and not raw_text:
            is_product_create_flow = action in {
                "product_create_base",
                "product_create_description",
                "product_create_delivery_text",
            }
            await _edit_state_panel_message(
                message,
                state,
                _tr(
                    locale,
                    "⚠️ <b>Entrada inválida</b>\n\n"
                    "Envía un valor válido o escribe <code>/cancel</code>.",
                    "⚠️ <b>Invalid input</b>\n\n"
                    "Send a valid value or write <code>/cancel</code>.",
                ),
                reply_markup=None if is_product_create_flow else _build_back_to_panel_keyboard(locale),
            )
            return

        if action == "homecfg_text_value":
            locale_target = str(data.get("admin_ui_home_locale") or "").lower()
            if locale_target not in _HOME_LAYOUT_LOCALES:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        "⚠️ Idioma inválido. Vuelve a elegir idioma para editar Home.",
                        "⚠️ Invalid language. Choose language again to edit Home.",
                    ),
                    reply_markup=_build_home_locale_keyboard("textloc", locale),
                )
                await state.clear()
                return
            layout = await _load_home_layout()
            layout[locale_target]["text"] = raw_text
            saved = await _save_home_layout(layout)
            await state.clear()
            await state.update_data(
                admin_ui_home_locale=locale_target,
                admin_ui_home_layout=saved,
                **panel_resume,
            )
            await _edit_state_panel_message(
                message,
                state,
                _tr(
                    locale,
                    "✅ <b>Texto Home actualizado.</b>\n\n"
                    f"Idioma: <b>{_home_locale_title(locale_target, locale)}</b>",
                    "✅ <b>Home text updated.</b>\n\n"
                    f"Language: <b>{_home_locale_title(locale_target, locale)}</b>",
                ),
                reply_markup=_build_home_locale_keyboard("textloc", locale),
            )
            return

        if action == "homecfg_btn_rename":
            locale_target = str(data.get("admin_ui_home_locale") or "").lower()
            if locale_target not in _HOME_LAYOUT_LOCALES:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(locale, "⚠️ Falta idioma objetivo.", "⚠️ Target language missing."),
                    reply_markup=_build_home_locale_keyboard("btnloc", locale),
                )
                await state.clear()
                return
            parts = [part.strip() for part in raw_text.split("|", maxsplit=1)]
            if len(parts) != 2:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        "⚠️ Formato inválido.\nUsa: <code>numero | nuevo texto</code>",
                        "⚠️ Invalid format.\nUse: <code>number | new label</code>",
                    ),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            index = _parse_positive_int_or_none(parts[0])
            if index is None:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(locale, "⚠️ Número inválido.", "⚠️ Invalid number."),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            new_label = parts[1].strip()[:64]
            if not new_label:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(locale, "⚠️ El texto no puede ir vacío.", "⚠️ Label cannot be empty."),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            layout = _normalize_home_layout(data.get("admin_ui_home_layout"))
            rows = _clone_home_button_rows(layout[locale_target]["buttons"])
            slot = _find_home_button_slot(rows, index)
            if not slot:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(locale, "⚠️ Número fuera de rango.", "⚠️ Number out of range."),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            row_index, col_index = slot
            rows[row_index][col_index]["label"] = new_label
            layout[locale_target]["buttons"] = _trim_home_button_rows(rows)
            saved = await _save_home_layout(layout)
            await state.clear()
            await state.update_data(
                admin_ui_home_locale=locale_target,
                admin_ui_home_layout=saved,
                **panel_resume,
            )
            await _edit_state_panel_message(
                message,
                state,
                _tr(locale, "✅ <b>Botón renombrado.</b>\n\n", "✅ <b>Button renamed.</b>\n\n")
                + _build_home_buttons_panel_text(saved, locale_target, locale),
                reply_markup=_build_home_buttons_ops_keyboard(locale_target, locale),
            )
            return

        if action == "homecfg_btn_add":
            locale_target = str(data.get("admin_ui_home_locale") or "").lower()
            if locale_target not in _HOME_LAYOUT_LOCALES:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(locale, "⚠️ Falta idioma objetivo.", "⚠️ Target language missing."),
                    reply_markup=_build_home_locale_keyboard("btnloc", locale),
                )
                await state.clear()
                return
            parts = [part.strip() for part in raw_text.split("|")]
            if len(parts) < 2 or len(parts) > 5:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        "⚠️ Formato inválido.\nUsa:\n"
                        "<code>texto | callback_data</code>\n"
                        "o\n"
                        "<code>texto | callback_data | fila | posicion(1-2) | modo(correr|estricto)</code>",
                        "⚠️ Invalid format.\nUse:\n"
                        "<code>label | callback_data</code>\n"
                        "or\n"
                        "<code>label | callback_data | row | position(1-2) | mode(shift|strict)</code>",
                    ),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            label = parts[0][:64]
            target = parts[1].strip()
            if not label or not target:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(locale, "⚠️ Texto/acción inválidos.", "⚠️ Invalid label/action."),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            row_number = None
            position = None
            overflow_mode_raw: str | None = None
            if len(parts) >= 3:
                row_number = _parse_positive_int_or_none(parts[2])
                if row_number is None:
                    await _edit_state_panel_message(
                        message,
                        state,
                        _tr(
                            locale,
                            "⚠️ Fila inválida. Usa un número mayor a 0.",
                            "⚠️ Invalid row. Use a number greater than 0.",
                        ),
                        reply_markup=_build_admin_panel_keyboard(locale),
                    )
                    return
            if len(parts) == 4:
                candidate_pos = _parse_positive_int_or_none(parts[3])
                if candidate_pos in {1, 2}:
                    position = candidate_pos
                else:
                    overflow_mode_raw = parts[3]
            if len(parts) == 5:
                position = _parse_positive_int_or_none(parts[3])
                if position not in {1, 2}:
                    await _edit_state_panel_message(
                        message,
                        state,
                        _tr(
                            locale,
                            "⚠️ Posición inválida. Solo permite 1 o 2.",
                            "⚠️ Invalid position. Only 1 or 2 is allowed.",
                        ),
                        reply_markup=_build_admin_panel_keyboard(locale),
                    )
                    return
                overflow_mode_raw = parts[4]

            overflow_mode = _parse_home_overflow_mode(overflow_mode_raw)
            if overflow_mode is None:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        "⚠️ Modo inválido. Usa <code>correr</code> o <code>estricto</code>.",
                        "⚠️ Invalid mode. Use <code>shift</code> or <code>strict</code>.",
                    ),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            layout = _normalize_home_layout(data.get("admin_ui_home_layout"))
            rows = _clone_home_button_rows(layout[locale_target]["buttons"])
            if len(_flatten_home_buttons(rows)) >= _HOME_BUTTON_LIMIT:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        f"⚠️ Límite alcanzado ({_HOME_BUTTON_LIMIT} botones).",
                        f"⚠️ Limit reached ({_HOME_BUTTON_LIMIT} buttons).",
                    ),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            new_button: Dict[str, str]
            if target.startswith("url:http://") or target.startswith("url:https://"):
                new_button = {"label": label, "url": target[4:]}
            elif target.startswith("http://") or target.startswith("https://"):
                new_button = {"label": label, "url": target}
            else:
                new_button = {"label": label, "action": target[:64]}
            inserted_rows, insert_error = _insert_home_button(
                rows,
                new_button,
                row_number=row_number,
                position=position,
                overflow_mode=overflow_mode,
            )
            if insert_error == "ROW_FULL":
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        "⚠️ Esa fila ya tiene 2 botones. Usa modo <code>correr</code> para reacomodar.",
                        "⚠️ That row already has 2 buttons. Use <code>shift</code> mode to reflow.",
                    ),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            layout[locale_target]["buttons"] = inserted_rows
            saved = await _save_home_layout(layout)
            await state.clear()
            await state.update_data(
                admin_ui_home_locale=locale_target,
                admin_ui_home_layout=saved,
                **panel_resume,
            )
            await _edit_state_panel_message(
                message,
                state,
                _tr(locale, "✅ <b>Botón agregado.</b>\n\n", "✅ <b>Button added.</b>\n\n")
                + _build_home_buttons_panel_text(saved, locale_target, locale),
                reply_markup=_build_home_buttons_ops_keyboard(locale_target, locale),
            )
            return

        if action == "homecfg_btn_move":
            locale_target = str(data.get("admin_ui_home_locale") or "").lower()
            if locale_target not in _HOME_LAYOUT_LOCALES:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(locale, "⚠️ Falta idioma objetivo.", "⚠️ Target language missing."),
                    reply_markup=_build_home_locale_keyboard("btnloc", locale),
                )
                await state.clear()
                return
            parts = [part.strip() for part in raw_text.split("|")]
            if len(parts) < 3 or len(parts) > 4:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        "⚠️ Formato inválido.\nUsa: <code>numero | fila | posicion(1-2) | modo(correr|estricto)</code>",
                        "⚠️ Invalid format.\nUse: <code>number | row | position(1-2) | mode(shift|strict)</code>",
                    ),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            index = _parse_positive_int_or_none(parts[0])
            row_number = _parse_positive_int_or_none(parts[1])
            position = _parse_positive_int_or_none(parts[2])
            overflow_mode = _parse_home_overflow_mode(parts[3] if len(parts) == 4 else None)
            if index is None or row_number is None or position not in {1, 2}:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        "⚠️ Número/fila/posición inválidos.",
                        "⚠️ Invalid number/row/position.",
                    ),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            if overflow_mode is None:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        "⚠️ Modo inválido. Usa <code>correr</code> o <code>estricto</code>.",
                        "⚠️ Invalid mode. Use <code>shift</code> or <code>strict</code>.",
                    ),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            layout = _normalize_home_layout(data.get("admin_ui_home_layout"))
            rows = _clone_home_button_rows(layout[locale_target]["buttons"])
            total = len(_flatten_home_buttons(rows))
            if index > total:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(locale, "⚠️ Número fuera de rango.", "⚠️ Number out of range."),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            remaining_rows, button = _remove_home_button_by_index(rows, index)
            if not button:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(locale, "⚠️ Botón no encontrado.", "⚠️ Button not found."),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            moved_rows, insert_error = _insert_home_button(
                remaining_rows,
                button,
                row_number=row_number,
                position=position,
                overflow_mode=overflow_mode,
            )
            if insert_error == "ROW_FULL":
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        "⚠️ Esa fila ya tiene 2 botones. Usa modo <code>correr</code> para reacomodar.",
                        "⚠️ That row already has 2 buttons. Use <code>shift</code> mode to reflow.",
                    ),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            layout[locale_target]["buttons"] = moved_rows or _default_home_button_rows(locale_target)
            saved = await _save_home_layout(layout)
            await state.clear()
            await state.update_data(
                admin_ui_home_locale=locale_target,
                admin_ui_home_layout=saved,
                **panel_resume,
            )
            await _edit_state_panel_message(
                message,
                state,
                _tr(locale, "✅ <b>Botón movido.</b>\n\n", "✅ <b>Button moved.</b>\n\n")
                + _build_home_buttons_panel_text(saved, locale_target, locale),
                reply_markup=_build_home_buttons_ops_keyboard(locale_target, locale),
            )
            return

        if action == "homecfg_btn_solo":
            locale_target = str(data.get("admin_ui_home_locale") or "").lower()
            if locale_target not in _HOME_LAYOUT_LOCALES:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(locale, "⚠️ Falta idioma objetivo.", "⚠️ Target language missing."),
                    reply_markup=_build_home_locale_keyboard("btnloc", locale),
                )
                await state.clear()
                return
            parts = [part.strip() for part in raw_text.split("|")]
            if len(parts) != 2:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        "⚠️ Formato inválido.\nUsa: <code>numero | fila</code>",
                        "⚠️ Invalid format.\nUse: <code>number | row</code>",
                    ),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            index = _parse_positive_int_or_none(parts[0])
            row_number = _parse_positive_int_or_none(parts[1])
            if index is None or row_number is None:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(locale, "⚠️ Número/fila inválidos.", "⚠️ Invalid number/row."),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            layout = _normalize_home_layout(data.get("admin_ui_home_layout"))
            rows = _clone_home_button_rows(layout[locale_target]["buttons"])
            total = len(_flatten_home_buttons(rows))
            if index > total:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(locale, "⚠️ Número fuera de rango.", "⚠️ Number out of range."),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            remaining_rows, button = _remove_home_button_by_index(rows, index)
            if not button:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(locale, "⚠️ Botón no encontrado.", "⚠️ Button not found."),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            solo_rows, _ = _insert_home_button(
                remaining_rows,
                button,
                row_number=row_number,
                force_solo_row=True,
            )
            layout[locale_target]["buttons"] = solo_rows or _default_home_button_rows(locale_target)
            saved = await _save_home_layout(layout)
            await state.clear()
            await state.update_data(
                admin_ui_home_locale=locale_target,
                admin_ui_home_layout=saved,
                **panel_resume,
            )
            await _edit_state_panel_message(
                message,
                state,
                _tr(locale, "✅ <b>Botón movido a fila sola.</b>\n\n", "✅ <b>Button moved to solo row.</b>\n\n")
                + _build_home_buttons_panel_text(saved, locale_target, locale),
                reply_markup=_build_home_buttons_ops_keyboard(locale_target, locale),
            )
            return

        if action == "homecfg_btn_delete":
            locale_target = str(data.get("admin_ui_home_locale") or "").lower()
            if locale_target not in _HOME_LAYOUT_LOCALES:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(locale, "⚠️ Falta idioma objetivo.", "⚠️ Target language missing."),
                    reply_markup=_build_home_locale_keyboard("btnloc", locale),
                )
                await state.clear()
                return
            index = _parse_positive_int_or_none(raw_text)
            if index is None:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(locale, "⚠️ Número inválido.", "⚠️ Invalid number."),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            layout = _normalize_home_layout(data.get("admin_ui_home_layout"))
            rows = _clone_home_button_rows(layout[locale_target]["buttons"])
            total = len(_flatten_home_buttons(rows))
            if index < 1 or index > total:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(locale, "⚠️ Número fuera de rango.", "⚠️ Number out of range."),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            remaining_rows, removed = _remove_home_button_by_index(rows, index)
            if not removed:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(locale, "⚠️ Botón no encontrado.", "⚠️ Button not found."),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                return
            layout[locale_target]["buttons"] = remaining_rows or _default_home_button_rows(locale_target)
            saved = await _save_home_layout(layout)
            await state.clear()
            await state.update_data(
                admin_ui_home_locale=locale_target,
                admin_ui_home_layout=saved,
                **panel_resume,
            )
            await _edit_state_panel_message(
                message,
                state,
                _tr(locale, "✅ <b>Botón eliminado.</b>\n\n", "✅ <b>Button removed.</b>\n\n")
                + _build_home_buttons_panel_text(saved, locale_target, locale),
                reply_markup=_build_home_buttons_ops_keyboard(locale_target, locale),
            )
            return

        if action == "order_ref_view":
            text = await _build_order_detail_text(raw_text, locale)
            await _edit_state_panel_message(
                message,
                state,
                text,
                reply_markup=_build_back_to_panel_keyboard(locale),
            )
            await state.clear()
            return

        if action == "order_ref_approve":
            text = await _build_approve_order_text(raw_text, locale)
            await _edit_state_panel_message(
                message,
                state,
                text,
                reply_markup=_build_back_to_panel_keyboard(locale),
            )
            await state.clear()
            return

        if action == "order_ref_reject":
            await state.update_data(admin_ui_action="reject_reason", admin_ui_order_ref=raw_text)
            await _edit_state_panel_message(
                message,
                state,
                _tr(
                    locale,
                    "📝 <b>Motivo del rechazo</b>\n\n"
                    "Envía el motivo.\n"
                    "Ejemplo: <code>Comprobante borroso</code>",
                    "📝 <b>Reject reason</b>\n\n"
                    "Send the reason.\n"
                    "Example: <code>Blurry proof screenshot</code>",
                ),
                reply_markup=_build_back_to_panel_keyboard(locale),
            )
            return

        if action == "reject_reason":
            order_ref = str(data.get("admin_ui_order_ref") or "").strip()
            reason = raw_text or _tr(
                locale,
                "Comprobante inválido. Envía una nueva captura.",
                "Invalid payment proof. Send a new screenshot.",
            )
            text = await _build_reject_order_text(order_ref, reason, locale)
            await _edit_state_panel_message(
                message,
                state,
                text,
                reply_markup=_build_back_to_panel_keyboard(locale),
            )
            await state.clear()
            return

        if action == "order_ref_refund":
            await state.update_data(admin_ui_action="refund_reason", admin_ui_order_ref=raw_text)
            await _edit_state_panel_message(
                message,
                state,
                _tr(
                    locale,
                    "📝 <b>Motivo del reembolso</b>\n\n"
                    "Envía el motivo.\n"
                    "Ejemplo: <code>Reembolso solicitado por cliente</code>",
                    "📝 <b>Refund reason</b>\n\n"
                    "Send the reason.\n"
                    "Example: <code>Refund requested by customer</code>",
                ),
                reply_markup=_build_back_to_panel_keyboard(locale),
            )
            return

        if action == "refund_reason":
            order_ref = str(data.get("admin_ui_order_ref") or "").strip()
            reason = raw_text or _tr(locale, "Reembolso procesado por admin.", "Refund processed by admin.")
            text = await _build_refund_order_text(order_ref, reason, locale)
            await _edit_state_panel_message(
                message,
                state,
                text,
                reply_markup=_build_back_to_panel_keyboard(locale),
            )
            await state.clear()
            return

        if action == "ban_telegram_id":
            try:
                telegram_id = int(raw_text.split()[0])
            except ValueError:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        "❌ <b>telegram_id inválido</b>\n\nEjemplo: <code>7621162350</code>",
                        "❌ <b>Invalid telegram_id</b>\n\nExample: <code>7621162350</code>",
                    ),
                    reply_markup=_build_back_to_panel_keyboard(locale),
                )
                return
            await state.update_data(admin_ui_action="ban_reason", admin_ui_telegram_id=telegram_id)
            await _edit_state_panel_message(
                message,
                state,
                _tr(
                    locale,
                    "📝 <b>Motivo del ban</b>\n\n"
                    "Envía el motivo.\n"
                    "Ejemplo: <code>Fraude en comprobantes</code>",
                    "📝 <b>Ban reason</b>\n\n"
                    "Send the reason.\n"
                    "Example: <code>Payment proof fraud</code>",
                ),
                reply_markup=_build_back_to_panel_keyboard(locale),
            )
            return

        if action == "ban_reason":
            telegram_id = int(data.get("admin_ui_telegram_id"))
            reason = raw_text or "Baneado por admin."
            text = await _build_ban_user_text(
                message.from_user.id if message.from_user else None,
                telegram_id,
                reason,
            )
            await _edit_state_panel_message(
                message,
                state,
                text,
                reply_markup=_build_back_to_panel_keyboard(locale),
            )
            await state.clear()
            return

        if action == "unban_telegram_id":
            try:
                telegram_id = int(raw_text.split()[0])
            except ValueError:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        "❌ <b>telegram_id inválido</b>\n\nEjemplo: <code>7621162350</code>",
                        "❌ <b>Invalid telegram_id</b>\n\nExample: <code>7621162350</code>",
                    ),
                    reply_markup=_build_back_to_panel_keyboard(locale),
                )
                return
            text = await _build_unban_user_text(telegram_id)
            await _edit_state_panel_message(
                message,
                state,
                text,
                reply_markup=_build_back_to_panel_keyboard(locale),
            )
            await state.clear()
            return

        if action == "broadcast_text":
            await state.update_data(
                admin_ui_action="broadcast_buttons",
                admin_ui_broadcast_text=plain_text,
                admin_ui_broadcast_plain_text=plain_text,
                admin_ui_broadcast_entities=message_entities,
            )
            await _edit_state_panel_message(
                message,
                state,
                _build_broadcast_buttons_prompt_text(locale),
                reply_markup=_build_broadcast_step_keyboard("buttons", locale),
            )
            return

        if action == "broadcast_buttons":
            try:
                buttons = _parse_broadcast_buttons_input(raw_text, locale)
            except ValueError as exc:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        f"⚠️ <b>{_escape_html(exc)}</b>\n\n"
                        "Vuelve a enviar los botones o escribe <code>sin</code>.",
                        f"⚠️ <b>{_escape_html(exc)}</b>\n\n"
                        "Send the buttons again or type <code>none</code>.",
                    ),
                    reply_markup=_build_broadcast_step_keyboard("buttons", locale),
                )
                return

            await state.update_data(
                admin_ui_action="broadcast_media",
                admin_ui_broadcast_buttons=buttons,
            )
            await _edit_state_panel_message(
                message,
                state,
                _build_broadcast_media_prompt_text(locale),
                reply_markup=_build_broadcast_step_keyboard("media", locale),
            )
            return

        if action == "broadcast_media":
            message_text = str(data.get("admin_ui_broadcast_text") or "").strip()
            if not message_text:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        "⚠️ <b>Se perdió el texto de la difusión.</b>\n\nInicia de nuevo desde el botón de difusión.",
                        "⚠️ <b>Broadcast text context was lost.</b>\n\nStart again from the broadcast button.",
                    ),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                await state.clear()
                return

            buttons = _normalize_broadcast_buttons_state(data.get("admin_ui_broadcast_buttons"))

            media_file_id: str | None = None
            media_kind: str | None = None
            if photo_file_id:
                media_file_id = photo_file_id
                media_kind = "photo"
            elif animation_file_id:
                media_file_id = animation_file_id
                media_kind = "animation"
            elif video_file_id:
                media_file_id = video_file_id
                media_kind = "video"
            elif raw_text and raw_text.lower() in _BROADCAST_SKIP_WORDS:
                media_file_id = None
                media_kind = None
            else:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        "⚠️ <b>Multimedia inválida.</b>\n\n"
                        "Envía una imagen, GIF o video, o escribe <code>sin</code>.",
                        "⚠️ <b>Invalid media.</b>\n\n"
                        "Send an image, GIF or video, or type <code>none</code>.",
                    ),
                    reply_markup=_build_broadcast_step_keyboard("media", locale),
                )
                return

            await state.update_data(
                admin_ui_action="broadcast_review",
                admin_ui_broadcast_buttons=buttons,
                admin_ui_broadcast_media_file_id=media_file_id or "",
                admin_ui_broadcast_media_kind=media_kind or "",
            )
            review_text = _build_broadcast_review_text(
                message_text,
                buttons=buttons,
                media_kind=media_kind,
                locale=locale,
            )
            await _edit_state_panel_message(
                message,
                state,
                review_text,
                reply_markup=_build_broadcast_review_keyboard(locale),
            )
            return

        if action == "broadcast_review":
            message_text = str(data.get("admin_ui_broadcast_text") or "").strip()
            buttons = _normalize_broadcast_buttons_state(data.get("admin_ui_broadcast_buttons"))
            media_kind = str(data.get("admin_ui_broadcast_media_kind") or "").strip().lower()
            await _edit_state_panel_message(
                message,
                state,
                _build_broadcast_review_text(message_text, buttons, media_kind, locale),
                reply_markup=_build_broadcast_review_keyboard(locale),
            )
            return

        if action == "broadcast_review_edit_text":
            buttons = _normalize_broadcast_buttons_state(data.get("admin_ui_broadcast_buttons"))
            media_kind = str(data.get("admin_ui_broadcast_media_kind") or "").strip().lower()
            await state.update_data(
                admin_ui_action="broadcast_review",
                admin_ui_broadcast_text=plain_text,
                admin_ui_broadcast_plain_text=plain_text,
                admin_ui_broadcast_entities=message_entities,
            )
            await _edit_state_panel_message(
                message,
                state,
                _build_broadcast_review_text(plain_text, buttons, media_kind, locale),
                reply_markup=_build_broadcast_review_keyboard(locale),
            )
            return

        if action == "broadcast_review_edit_buttons":
            try:
                buttons = _parse_broadcast_buttons_input(raw_text, locale)
            except ValueError as exc:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        f"⚠️ <b>{_escape_html(exc)}</b>\n\n"
                        "Vuelve a enviar los botones.",
                        f"⚠️ <b>{_escape_html(exc)}</b>\n\n"
                        "Send the buttons again.",
                    ),
                    reply_markup=_build_back_to_panel_keyboard(locale),
                )
                return
            message_text = str(data.get("admin_ui_broadcast_text") or "").strip()
            media_kind = str(data.get("admin_ui_broadcast_media_kind") or "").strip().lower()
            await state.update_data(
                admin_ui_action="broadcast_review",
                admin_ui_broadcast_buttons=buttons,
            )
            await _edit_state_panel_message(
                message,
                state,
                _build_broadcast_review_text(message_text, buttons, media_kind, locale),
                reply_markup=_build_broadcast_review_keyboard(locale),
            )
            return

        if action == "broadcast_review_edit_media":
            message_text = str(data.get("admin_ui_broadcast_text") or "").strip()
            buttons = _normalize_broadcast_buttons_state(data.get("admin_ui_broadcast_buttons"))
            current_media_file_id = str(data.get("admin_ui_broadcast_media_file_id") or "").strip()
            current_media_kind = str(data.get("admin_ui_broadcast_media_kind") or "").strip().lower()

            next_media_file_id = current_media_file_id
            next_media_kind = current_media_kind
            text_lower = raw_text.lower() if raw_text else ""
            if photo_file_id:
                next_media_file_id = photo_file_id
                next_media_kind = "photo"
            elif animation_file_id:
                next_media_file_id = animation_file_id
                next_media_kind = "animation"
            elif video_file_id:
                next_media_file_id = video_file_id
                next_media_kind = "video"
            elif text_lower in _BROADCAST_EDIT_KEEP_WORDS:
                next_media_file_id = current_media_file_id
                next_media_kind = current_media_kind
            elif text_lower in _BROADCAST_SKIP_WORDS:
                next_media_file_id = ""
                next_media_kind = ""
            else:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        "⚠️ <b>Multimedia inválida.</b>\n\n"
                        "Envía una imagen, GIF o video.\n"
                        "Escribe <code>sin</code> para quitar multimedia.\n"
                        "Escribe <code>saltar</code> para mantener la actual.",
                        "⚠️ <b>Invalid media.</b>\n\n"
                        "Send an image, GIF or video.\n"
                        "Type <code>none</code> to remove media.\n"
                        "Type <code>skip</code> to keep current media.",
                    ),
                    reply_markup=_build_back_to_panel_keyboard(locale),
                )
                return

            await state.update_data(
                admin_ui_action="broadcast_review",
                admin_ui_broadcast_media_file_id=next_media_file_id,
                admin_ui_broadcast_media_kind=next_media_kind,
            )
            await _edit_state_panel_message(
                message,
                state,
                _build_broadcast_review_text(
                    message_text,
                    buttons,
                    next_media_kind,
                    locale,
                ),
                reply_markup=_build_broadcast_review_keyboard(locale),
            )
            return

        if action == "broadcast_message":
            text = await _build_broadcast_result_text(raw_text, locale=locale)
            await _edit_state_panel_message(
                message,
                state,
                text,
                reply_markup=_build_back_to_panel_keyboard(locale),
            )
            await state.clear()
            return

        if action == "product_create_base":
            try:
                payload = _build_product_create_payload(raw_text, locale)
            except ValueError as exc:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        "⚠️ <b>Datos inválidos</b>\n\n"
                        f"{_escape_html(exc)}\n\n"
                        "Formato: <code>nombre | precio | categoria</code>",
                        "⚠️ <b>Invalid data</b>\n\n"
                        f"{_escape_html(exc)}\n\n"
                        "Format: <code>name | price | category</code>",
                    ),
                    reply_markup=None,
                )
                return
            await state.update_data(
                admin_ui_action="product_create_description",
                admin_ui_product_payload=payload,
            )
            await _edit_state_panel_message(
                message,
                state,
                _tr(
                    locale,
                    "📝 <b>Paso 2/4 · Descripción</b>\n\n"
                    "Envía la descripción del producto en máximo <b>8 líneas</b>.\n"
                    "Cada salto de línea cuenta.",
                    "📝 <b>Step 2/4 · Description</b>\n\n"
                    "Send the product description with a maximum of <b>8 lines</b>.\n"
                    "Each line break counts.",
                ),
                reply_markup=None,
            )
            return

        if action == "product_create_description":
            try:
                description = _build_product_description(raw_text, locale)
            except ValueError as exc:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        f"⚠️ <b>{_escape_html(exc)}</b>\n\n"
                        "Vuelve a enviar la descripción (máximo 8 líneas).",
                        f"⚠️ <b>{_escape_html(exc)}</b>\n\n"
                        "Please send the description again (max 8 lines).",
                    ),
                    reply_markup=None,
                )
                return
            payload = dict(data.get("admin_ui_product_payload") or {})
            if not payload:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        "⚠️ <b>Se perdió el contexto de creación.</b>\n\nInicia de nuevo con el botón de agregar producto.",
                        "⚠️ <b>The create context was lost.</b>\n\nStart again using the add-product button.",
                    ),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                await state.clear()
                return
            payload["description"] = description
            await state.update_data(
                admin_ui_action="product_create_delivery_text",
                admin_ui_product_payload=payload,
            )
            await _edit_state_panel_message(
                message,
                state,
                _tr(
                    locale,
                    "💬 <b>Paso 3/4 · Texto para el cliente</b>\n\n"
                    "Envía el texto que el cliente recibirá automáticamente después de comprar.\n"
                    "Puedes usar varias líneas.",
                    "💬 <b>Step 3/4 · Customer text</b>\n\n"
                    "Send the text the customer will receive automatically after purchase.\n"
                    "You can use multiple lines.",
                ),
                reply_markup=None,
            )
            return

        if action == "product_create_delivery_text":
            try:
                delivery_text = _build_product_delivery_text(raw_text, locale)
            except ValueError as exc:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        f"⚠️ <b>{_escape_html(exc)}</b>\n\n"
                        "Vuelve a enviar el texto que recibirá el cliente.",
                        f"⚠️ <b>{_escape_html(exc)}</b>\n\n"
                        "Please send the text the customer will receive again.",
                    ),
                    reply_markup=None,
                )
                return
            payload = dict(data.get("admin_ui_product_payload") or {})
            if not payload:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        "⚠️ <b>Se perdió el contexto de creación.</b>\n\nInicia de nuevo con el botón de agregar producto.",
                        "⚠️ <b>The create context was lost.</b>\n\nStart again using the add-product button.",
                    ),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                await state.clear()
                return
            payload["delivery_payload"] = {"text": delivery_text}
            await state.update_data(
                admin_ui_action="product_create_image",
                admin_ui_product_payload=payload,
            )
            await _edit_state_panel_message(
                message,
                state,
                _tr(
                    locale,
                    "🖼️ <b>Paso 4/4 · Imagen</b>\n\n"
                    "Envía una <b>foto</b> del producto.\n"
                    "También puedes enviar una URL (<code>https://...</code>)\n"
                    "o escribir <code>sin imagen</code>.",
                    "🖼️ <b>Step 4/4 · Image</b>\n\n"
                    "Send a product <b>photo</b>.\n"
                    "You can also send a URL (<code>https://...</code>)\n"
                    "or type <code>no image</code>.",
                ),
                reply_markup=None,
            )
            return

        if action == "product_create_image":
            payload = dict(data.get("admin_ui_product_payload") or {})
            if not payload:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        "⚠️ <b>Se perdió el contexto de creación.</b>\n\nInicia de nuevo con el botón de agregar producto.",
                        "⚠️ <b>The create context was lost.</b>\n\nStart again using the add-product button.",
                    ),
                    reply_markup=_build_admin_panel_keyboard(locale),
                )
                await state.clear()
                return

            image_value: Optional[str] = None
            if photo_file_id:
                image_value = photo_file_id
            elif raw_text:
                low = raw_text.lower()
                if low in _PRODUCT_IMAGE_SKIP_WORDS:
                    image_value = None
                elif raw_text.startswith("http://") or raw_text.startswith("https://"):
                    image_value = raw_text
                else:
                    await _edit_state_panel_message(
                        message,
                        state,
                        _tr(
                            locale,
                            "⚠️ <b>Imagen inválida.</b>\n\n"
                            "Envía una foto, una URL válida, o escribe <code>sin imagen</code>.",
                            "⚠️ <b>Invalid image.</b>\n\n"
                            "Send a photo, a valid URL, or type <code>no image</code>.",
                        ),
                        reply_markup=None,
                    )
                    return
            else:
                await _edit_state_panel_message(
                    message,
                    state,
                    _tr(
                        locale,
                        "⚠️ <b>Falta la imagen.</b>\n\n"
                        "Envía una foto, una URL válida, o escribe <code>sin imagen</code>.",
                        "⚠️ <b>Image is required.</b>\n\n"
                        "Send a photo, a valid URL, or type <code>no image</code>.",
                    ),
                    reply_markup=None,
                )
                return

            payload["image_url"] = image_value
            created = await api_client.admin_create_product(payload)
            try:
                await api_client.admin_recalculate_products()
            except Exception:
                pass
            product = created.get("product") or {}
            await _edit_state_panel_message(
                message,
                state,
                _build_product_created_text(product, locale),
                reply_markup=_build_admin_panel_keyboard(locale),
            )
            await state.clear()
            return

        await _edit_state_panel_message(
            message,
            state,
            _build_admin_panel_text(locale),
            reply_markup=_build_admin_panel_keyboard(locale),
        )
        await state.clear()
    except httpx.HTTPStatusError as exc:
        try:
            payload = exc.response.json()
        except Exception:
            payload = {}
        error_code = payload.get("error") if isinstance(payload, dict) else None
        if error_code == "ORDER_NOT_FOUND":
            text = _build_order_not_found_text(payload, locale)
        else:
            text = _tr(
                locale,
                "❌ <b>Error ejecutando acción</b>\n\n"
                f"Código: <b>{exc.response.status_code}</b>\n"
                f"Detalle: <code>{_escape_html(error_code or 'ERROR')}</code>",
                "❌ <b>Error running action</b>\n\n"
                f"Code: <b>{exc.response.status_code}</b>\n"
                f"Detail: <code>{_escape_html(error_code or 'ERROR')}</code>",
            )
        await _edit_state_panel_message(
            message,
            state,
            text,
            reply_markup=_build_admin_panel_keyboard(locale),
        )
        await state.clear()
    except Exception as exc:
        await _edit_state_panel_message(
            message,
            state,
            _tr(
                locale,
                "❌ <b>Error ejecutando acción</b>\n\n"
                f"<code>{_escape_html(exc)}</code>",
                "❌ <b>Error running action</b>\n\n"
                f"<code>{_escape_html(exc)}</code>",
            ),
            reply_markup=_build_admin_panel_keyboard(locale),
        )
        await state.clear()
    finally:
        await _delete_message_safe(message)


async def _send_admin_status_message(message: Message, locale: str | None) -> None:
    if not locale:
        return
    if not _admin_http_configured():
        await message.answer("⚠️ Falta API_TOKEN o ADMIN_API_KEY en `telegram-sales-bot/.env`.")
        return
    try:
        health, maintenance, counts, summary = await asyncio.gather(
            api_client.ping_health(),
            api_client.admin_get_maintenance(),
            api_client.admin_get_order_status_counts(),
            api_client.admin_get_summary(),
        )
        await message.answer(
            _build_status_text(health, maintenance, counts, summary, locale),
            parse_mode="HTML",
        )
    except Exception as exc:
        await message.answer(f"❌ No pude obtener estado admin: {exc}")


@router.message(Command("astatus"))
async def cmd_astatus(message: Message) -> None:
    locale = await _admin_guard(message)
    await _send_admin_status_message(message, locale)


@router.message(F.text.regexp(r"^\.info(?:\s+.*)?$"))
async def cmd_info_alias(message: Message) -> None:
    locale = await _admin_guard(message)
    await _send_admin_status_message(message, locale)


@router.message(Command("orders"))
async def cmd_orders(message: Message) -> None:
    locale = await _admin_guard(message)
    if not locale:
        return
    if not _admin_http_configured():
        await message.answer("⚠️ Falta API_TOKEN o ADMIN_API_KEY en `telegram-sales-bot/.env`.")
        return
    args = _extract_args(message.text)
    parts = args.split() if args else []
    if not parts or parts[0].lower() != "pending":
        await message.answer("Uso: /orders pending [n]")
        return
    limit = _safe_int(parts[1], 10, 1, 30) if len(parts) > 1 else 10
    try:
        response = await api_client.admin_list_orders(
            status="WAITING_PAYMENT", page=1, page_size=limit
        )
        items = response.get("items", [])
        if not items:
            await message.answer("✅ No hay órdenes pendientes en este momento.")
            return
        lines = [f"🧾 Órdenes pendientes ({len(items)})"]
        for row in items:
            order_number = row.get("order_number")
            order_label = (
                str(order_number).zfill(5)
                if order_number is not None
                else str(row.get("id", ""))[:8]
            )
            username = row.get("telegram_username") or "-"
            lines.append(
                f"• {order_label} | {row.get('id')} | @{username} | {_fmt_dt(row.get('created_at'))}"
            )
        await message.answer("\n".join(lines))
    except Exception as exc:
        await message.answer(f"❌ Error listando órdenes pendientes: {exc}")


@router.message(Command("order"))
async def cmd_order(message: Message) -> None:
    locale = await _admin_guard(message)
    if not locale:
        return
    if not _admin_http_configured():
        await message.answer("⚠️ Falta API_TOKEN o ADMIN_API_KEY en `telegram-sales-bot/.env`.")
        return
    order_id = _extract_args(message.text)
    if not order_id:
        await message.answer("Uso: /order <order_id>")
        return
    try:
        data = await api_client.admin_get_order(order_id)
        order = data.get("order", {})
        user = data.get("user", {})
        payment = data.get("payment") or {}
        totals = data.get("totals") or {}
        local_total = data.get("local_total") or {}
        items = data.get("items") or []
        item_lines = []
        for item in items[:5]:
            name = item.get("name") or "-"
            qty = item.get("qty") or 1
            total = item.get("line_total_usd") or item.get("unit_price_usd") or 0
            item_lines.append(f"- {name} x{qty} (${total})")
        items_block = "\n".join(item_lines) if item_lines else "- Sin items"
        text = (
            f"🧾 Orden: {order.get('id')}\n"
            f"Estado: {order.get('status')}\n"
            f"Usuario: {user.get('telegram_id')} (@{user.get('telegram_username') or '-'})\n"
            f"Método: {payment.get('payment_method') or '-'}\n"
            f"Revisión pago: {payment.get('review_status') or '-'}\n"
            f"Total USD: ${totals.get('total_usd')}\n"
            f"Markup: {totals.get('markup_percent') if totals.get('markup_percent') is not None else '-'}\n"
            f"Total local: {local_total.get('amount')} {local_total.get('currency')}\n"
            f"Creada: {_fmt_dt(order.get('created_at'))}\n"
            f"Pagada: {_fmt_dt(order.get('paid_at'))}\n\n"
            f"Productos:\n{items_block}"
        )
        await message.answer(text)
    except httpx.HTTPStatusError as exc:
        await message.answer(f"❌ Error consultando orden ({exc.response.status_code}).")
    except Exception as exc:
        await message.answer(f"❌ Error consultando orden: {exc}")


@router.message(Command("approve"))
async def cmd_approve(message: Message) -> None:
    locale = await _admin_guard(message)
    if not locale:
        return
    if not _admin_http_configured():
        await message.answer("⚠️ Falta API_TOKEN o ADMIN_API_KEY en `telegram-sales-bot/.env`.")
        return
    order_id = _extract_args(message.text)
    if not order_id:
        await message.answer("Uso: /approve <order_id>")
        return
    try:
        response = await api_client.admin_mark_order_paid(order_id)
        status = (
            response.get("order", {}).get("status")
            or response.get("status")
            or "OK"
        )
        await message.answer(f"✅ Orden aprobada: {order_id}\nEstado: {status}")
    except httpx.HTTPStatusError as exc:
        try:
            payload = exc.response.json()
        except Exception:
            payload = {}
        await message.answer(
            f"❌ No se pudo aprobar ({exc.response.status_code}): {payload.get('error') or 'ERROR'}"
        )
    except Exception as exc:
        await message.answer(f"❌ Error aprobando orden: {exc}")


@router.message(Command("reject"))
async def cmd_reject(message: Message) -> None:
    locale = await _admin_guard(message)
    if not locale:
        return
    if not _admin_http_configured():
        await message.answer("⚠️ Falta API_TOKEN o ADMIN_API_KEY en `telegram-sales-bot/.env`.")
        return
    args = _extract_args(message.text)
    parts = args.split(maxsplit=1)
    if not parts:
        await message.answer("Uso: /reject <order_id> <motivo>")
        return
    order_id = parts[0]
    reason = parts[1].strip() if len(parts) > 1 else "Comprobante inválido. Envía una nueva captura."
    try:
        await api_client.admin_reject_order(order_id, mode="retry", reason=reason)
        await message.answer(f"✅ Orden rechazada (modo retry): {order_id}")
    except httpx.HTTPStatusError as exc:
        try:
            payload = exc.response.json()
        except Exception:
            payload = {}
        await message.answer(
            f"❌ No se pudo rechazar ({exc.response.status_code}): {payload.get('error') or 'ERROR'}"
        )
    except Exception as exc:
        await message.answer(f"❌ Error rechazando orden: {exc}")


@router.message(Command("refund"))
async def cmd_refund(message: Message) -> None:
    locale = await _admin_guard(message)
    if not locale:
        return
    if not _admin_http_configured():
        await message.answer("⚠️ Falta API_TOKEN o ADMIN_API_KEY en `telegram-sales-bot/.env`.")
        return
    args = _extract_args(message.text)
    parts = args.split(maxsplit=1)
    if not parts:
        await message.answer("Uso: /refund <order_id> <motivo>")
        return
    order_id = parts[0]
    reason = parts[1].strip() if len(parts) > 1 else "Reembolso procesado por admin."
    try:
        response = await api_client.admin_refund_order(order_id, reason=reason)
        refund = response.get("refund", {})
        await message.answer(
            f"✅ Reembolso aplicado a {order_id}\nMonto: ${refund.get('amount')}\nTipo: {refund.get('refund_type')}"
        )
    except httpx.HTTPStatusError as exc:
        try:
            payload = exc.response.json()
        except Exception:
            payload = {}
        await message.answer(
            f"❌ No se pudo reembolsar ({exc.response.status_code}): {payload.get('error') or 'ERROR'}"
        )
    except Exception as exc:
        await message.answer(f"❌ Error reembolsando orden: {exc}")


@router.message(Command("ban"))
async def cmd_ban(message: Message) -> None:
    locale = await _admin_guard(message)
    if not locale:
        return
    args = _extract_args(message.text)
    parts = args.split(maxsplit=1)
    if not parts:
        await message.answer("Uso: /ban <telegram_id> <motivo>")
        return
    try:
        telegram_id = int(parts[0])
    except ValueError:
        await message.answer("❌ telegram_id inválido.")
        return
    reason = parts[1].strip() if len(parts) > 1 else "Baneado por admin."
    try:
        if BOT_TO_API_SECRET:
            response = await api_client.ban_user(
                telegram_id,
                {
                    "reason": reason,
                    "admin_telegram_id": message.from_user.id if message.from_user else None,
                },
                BOT_TO_API_SECRET,
            )
            if isinstance(response, dict) and response.get("status_code"):
                await message.answer("❌ No se pudo banear usuario.")
                return
            already = bool(response.get("already_banned")) if isinstance(response, dict) else False
            await message.answer(
                "✅ Usuario ya estaba baneado." if already else "✅ Usuario baneado."
            )
            return
        if not _admin_http_configured():
            await message.answer("⚠️ Falta BOT_TO_API_SECRET o credencial admin para banear.")
            return
        result = await api_client.admin_toggle_ban(telegram_id)
        await message.answer(
            "✅ Usuario baneado." if result.get("banned") else "ℹ️ Usuario ya estaba desbaneado."
        )
    except Exception as exc:
        await message.answer(f"❌ Error en ban: {exc}")


@router.message(Command("unban"))
async def cmd_unban(message: Message) -> None:
    locale = await _admin_guard(message)
    if not locale:
        return
    if not _admin_http_configured():
        await message.answer("⚠️ Falta API_TOKEN o ADMIN_API_KEY en `telegram-sales-bot/.env`.")
        return
    raw = _extract_args(message.text)
    if not raw:
        await message.answer("Uso: /unban <telegram_id>")
        return
    try:
        telegram_id = int(raw.split()[0])
    except ValueError:
        await message.answer("❌ telegram_id inválido.")
        return
    try:
        status = await api_client.get_ban_status(telegram_id)
        if not status.get("banned"):
            await message.answer("ℹ️ Ese usuario no está baneado.")
            return
        result = await api_client.admin_toggle_ban(telegram_id)
        if result.get("banned") is False:
            await message.answer("✅ Usuario desbaneado.")
        else:
            await message.answer("❌ No se pudo desbanear usuario.")
    except Exception as exc:
        await message.answer(f"❌ Error en unban: {exc}")


@router.message(Command("maint"))
async def cmd_maint(message: Message) -> None:
    locale = await _admin_guard(message)
    if not locale:
        return
    if not _admin_http_configured():
        await message.answer("⚠️ Falta API_TOKEN o ADMIN_API_KEY en `telegram-sales-bot/.env`.")
        return
    arg = _extract_args(message.text).lower()
    if arg not in {"on", "off"}:
        await message.answer("Uso: /maint on|off")
        return
    active = arg == "on"
    try:
        response = await api_client.admin_set_maintenance(active)
        state = "ON" if response.get("active") else "OFF"
        await message.answer(f"✅ Mantenimiento: {state}")
    except Exception as exc:
        await message.answer(f"❌ Error actualizando mantenimiento: {exc}")


@router.message(Command("broadcast"))
async def cmd_broadcast(message: Message) -> None:
    locale = await _admin_guard(message)
    if not locale:
        return
    if not _admin_http_configured():
        await message.answer("⚠️ Falta API_TOKEN o ADMIN_API_KEY en `telegram-sales-bot/.env`.")
        return
    msg = _extract_args(message.text)
    if not msg:
        await message.answer("Uso: /broadcast <mensaje>")
        return
    try:
        create_res = await api_client.admin_create_broadcast(msg, segment="ALL_USERS")
        broadcast = create_res.get("broadcast", {})
        broadcast_id = str(broadcast.get("id"))
        if not broadcast_id:
            await message.answer("❌ No pude crear el broadcast.")
            return
        send_res = await api_client.admin_send_broadcast(broadcast_id)
        result = send_res.get("result", {})
        await message.answer(
            "✅ Broadcast enviado\n"
            f"ID: {broadcast_id}\n"
            f"Objetivo: {result.get('target_count')}\n"
            f"Enviados: {result.get('sent_count')}\n"
            f"Fallidos: {result.get('failed_count')}"
        )
    except httpx.HTTPStatusError as exc:
        try:
            payload = exc.response.json()
        except Exception:
            payload = {}
        await message.answer(
            f"❌ Error broadcast ({exc.response.status_code}): {payload.get('error') or 'ERROR'}"
        )
    except Exception as exc:
        await message.answer(f"❌ Error enviando broadcast: {exc}")


@router.message(Command("logs"))
async def cmd_logs(message: Message) -> None:
    locale = await _admin_guard(message)
    if not locale:
        return
    if not _admin_http_configured():
        await message.answer("⚠️ Falta API_TOKEN o ADMIN_API_KEY en `telegram-sales-bot/.env`.")
        return
    args = _extract_args(message.text).split()
    category = args[0].lower() if args else "payments"
    if category not in {"errors", "payments", "support"}:
        await message.answer("Uso: /logs [errors|payments|support] [n]")
        return
    limit = _safe_int(args[1], 10, 1, 25) if len(args) > 1 else 10
    try:
        data = await api_client.admin_get_logs(category=category, limit=limit)
        items = data.get("items", [])
        if not items:
            await message.answer(f"ℹ️ Sin registros en categoría `{category}`.", parse_mode="Markdown")
            return
        lines = [f"📚 Logs: {category} ({len(items)})"]
        for row in items:
            created = _fmt_dt(row.get("created_at"))
            action = row.get("action") or row.get("kind") or "-"
            ref_id = row.get("ref_id") or row.get("entity_id") or "-"
            message_text = (row.get("message") or "").strip().replace("\n", " ")
            message_short = message_text[:120] if message_text else ""
            suffix = f" | {message_short}" if message_short else ""
            lines.append(f"• {created} | {action} | {ref_id}{suffix}")
        await message.answer("\n".join(lines))
    except Exception as exc:
        await message.answer(f"❌ Error consultando logs: {exc}")
