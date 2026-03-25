from __future__ import annotations

import asyncio
import html
from typing import Any, Dict, List

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message
from aiogram.enums import ParseMode

from ..config import API_BASE_URL, API_TOKEN, BINANCE_ID, BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS, BOT_RATE_LIMIT_ENABLED, BOT_RATE_LIMIT_SECONDS, BOT_TO_API_SECRET
from ..services.api_client import ApiClient
from ..services.bot_assets import get_bot_asset_image
from ..services.fx import usd_to_cop, usd_to_mxn
from ..services.user_locale import get_user_locale
from ..utils.main_view import render_main_view, render_main_view_with_photo, set_main_message_id
from ..utils.rate_limit import check_global_rate_limit
from .shop import (
    _animate_analysis_notice,
    _build_analysis_notice_text,
    _build_destination_lines,
    _cleanup_analysis_notice,
    _extract_crypto_destinations,
    _find_payment_method,
    _format_payment_method_title,
    _get_crypto_asset_image,
    _get_payment_method_image,
    _get_payment_methods_payload,
    _get_payment_methods_header_image,
)
from ..services.crypto_rates import usd_to_btc_rate, usd_to_ltc_rate

router = Router()
api_client = ApiClient(API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET)


class WalletStates(StatesGroup):
    awaiting_topup_amount = State()
    awaiting_topup_proof = State()


WALLET_HISTORY_PAGE_SIZE = 5
WALLET_HISTORY_FETCH_LIMIT = 100


def _is_en(locale: str | None) -> bool:
    return str(locale or "").lower().startswith("en")


def _tr(locale: str | None, es_text: str, en_text: str) -> str:
    return en_text if _is_en(locale) else es_text


def _fmt_usd(value: Any) -> str:
    try:
        number = float(value or 0)
    except (TypeError, ValueError):
        number = 0.0
    return f"${number:,.0f} USD"


def _format_topup_label(topup: Dict[str, Any] | None) -> str:
    if not isinstance(topup, dict):
        return "-"
    return str(topup.get("topup_number_label") or topup.get("topup_number") or "-")


def _wallet_home_keyboard(locale: str | None = "es") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=_tr(locale, "💳 Recargar saldo", "💳 Top up"),
                    callback_data="wallet:topup",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "📜 Historial", "📜 History"),
                    callback_data="wallet:history",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "🏠 Inicio", "🏠 Home"),
                    callback_data="home:show",
                ),
            ],
        ]
    )


def _wallet_history_keyboard(
    page: int,
    total_pages: int,
    locale: str | None = "es",
) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = [
        [
            InlineKeyboardButton(
                text=_tr(locale, "💳 Recargar saldo", "💳 Top up"),
                callback_data="wallet:topup",
            )
        ]
    ]
    if total_pages > 1:
        rows.append(
            [
                InlineKeyboardButton(
                    text="←",
                    callback_data=f"wallet:history:page:{max(page - 1, 1)}",
                ),
                InlineKeyboardButton(
                    text=f"{page}/{total_pages}",
                    callback_data="wallet:history:noop",
                ),
                InlineKeyboardButton(
                    text="→",
                    callback_data=f"wallet:history:page:{min(page + 1, total_pages)}",
                ),
            ]
        )
    rows.append(
        [
            InlineKeyboardButton(
                text=_tr(locale, "⬅️ Volver", "⬅️ Back"),
                callback_data="home:wallet",
            ),
            InlineKeyboardButton(
                text=_tr(locale, "🏠 Inicio", "🏠 Home"),
                callback_data="home:show",
            ),
        ]
    )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _wallet_topup_amount_keyboard(locale: str | None = "es") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=_tr(locale, "📜 Historial", "📜 History"),
                    callback_data="wallet:history",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "⬅️ Volver", "⬅️ Back"),
                    callback_data="home:wallet",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "🏠 Inicio", "🏠 Home"),
                    callback_data="home:show",
                ),
            ],
        ]
    )


def _wallet_topup_methods_keyboard(
    topup_ref: str,
    methods: List[Dict[str, Any]],
    locale: str | None = "es",
) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    enabled_methods = [item for item in methods if bool(item.get("enabled", True))]
    for index, method in enumerate(enabled_methods, start=1):
        label = str(method.get("label") or method.get("key") or "").strip()
        if not label:
            continue
        rows.append(
            [
                InlineKeyboardButton(
                    text=label,
                    callback_data=f"wallet:topup:method:{topup_ref}:{index}",
                )
            ]
        )
    rows.append(
        [
            InlineKeyboardButton(
                text=_tr(locale, "⬅️ Volver", "⬅️ Back"),
                callback_data="home:wallet",
            ),
            InlineKeyboardButton(
                text=_tr(locale, "🏠 Inicio", "🏠 Home"),
                callback_data="home:show",
            ),
        ]
    )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _wallet_crypto_assets_keyboard(
    topup_ref: str,
    locale: str | None = "es",
) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=_tr(locale, "₿ BTC", "₿ BTC"),
                    callback_data=f"wallet:topup:cryptoasset:{topup_ref}:btc",
                )
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "₮ USDT Tron", "₮ USDT Tron"),
                    callback_data=f"wallet:topup:cryptoasset:{topup_ref}:usdt_tron",
                )
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "₮ USDT BSC", "₮ USDT BSC"),
                    callback_data=f"wallet:topup:cryptoasset:{topup_ref}:usdt_bsc",
                )
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "Ł LTC", "Ł LTC"),
                    callback_data=f"wallet:topup:cryptoasset:{topup_ref}:ltc",
                )
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "⬅️ Volver", "⬅️ Back"),
                    callback_data=f"wallet:topup:methods:{topup_ref}",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "🏠 Inicio", "🏠 Home"),
                    callback_data="home:show",
                ),
            ],
        ]
    )


def _wallet_topup_pay_keyboard(
    topup_ref: str,
    locale: str | None = "es",
    back_callback_data: str | None = None,
) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=_tr(locale, "✅ Ya pagué", "✅ I paid"),
                    callback_data=f"wallet:topup:pay:{topup_ref}",
                )
            ],
            [
                InlineKeyboardButton(
                    text=_tr(locale, "⬅️ Volver", "⬅️ Back"),
                    callback_data=back_callback_data or f"wallet:topup:methods:{topup_ref}",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "🏠 Inicio", "🏠 Home"),
                    callback_data="home:show",
                ),
            ],
        ]
    )


def _wallet_topup_warning_line() -> str:
    return (
        "📝 Descripción: No enviar captures falsos de apk o viejos ó seras Funado "
        "y colocado como Estafador en: @RATAS_VERIFICADAS"
    )


def _wallet_method_separator() -> str:
    return "---------------------------------"


async def _build_wallet_topup_method_text(
    method_key: str,
    amount: float,
    locale: str | None = "es",
    method: Dict[str, Any] | None = None,
) -> str:
    key = str(method_key or "").lower()
    if key in {"binance", "binance_id"}:
        destination_line = f"🆔: {html.escape(str(BINANCE_ID or '-'))}"
        title_line = "🟡  Binance ID"
        extra_amount_line = ""
    else:
        title_line = _format_payment_method_title(method_key, method, locale)
        destination_lines = _build_destination_lines(method_key, method, locale)
        destination_line = "\n".join(destination_lines).strip()
        extra_amount_line = ""
        if key == "nequi":
            try:
                rate = await usd_to_cop()
                cop_amount = amount * rate
                extra_amount_line = f"\n➡️ Enviar: {cop_amount:,.0f} COP"
            except Exception:
                extra_amount_line = "\n➡️ Enviar: COP (no disponible ahora)"
        elif key in {"mp", "mercadopago"}:
            try:
                rate = await usd_to_mxn()
                mxn_amount = amount * rate
                extra_amount_line = f"\n➡️ Enviar: {mxn_amount:,.2f} MXN"
            except Exception:
                extra_amount_line = "\n➡️ Enviar: MXN (no disponible ahora)"
        elif key == "paypal":
            extra_amount_line = f"\n➡️ Enviar: {(amount * 1.25):,.2f} USD"

    text = (
        f"{title_line}\n\n"
        f"{destination_line}\n"
        f"{_wallet_method_separator()}\n"
        f"💰 Monto: {_fmt_usd(amount)}"
        f"{extra_amount_line}\n"
        f"{_wallet_method_separator()}\n\n"
        f"{_wallet_topup_warning_line()}\n\n"
        "📸 Luego de pagar, envía la captura aquí mismo para confirmar ✅\n"
        "⚠️ Preferiblemente captura de pantalla (no foto)."
    )
    return text


def _wallet_topup_submitted_keyboard(locale: str | None = "es") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=_tr(locale, "⬅️ Volver", "⬅️ Back"),
                    callback_data="home:wallet",
                ),
                InlineKeyboardButton(
                    text=_tr(locale, "🏠 Inicio", "🏠 Home"),
                    callback_data="home:show",
                ),
            ]
        ]
    )


def _format_history_item(item: Dict[str, Any], locale: str | None = "es") -> str:
    direction = str(item.get("direction") or "").upper()
    prefix = "➕" if direction == "CREDIT" else "➖"
    note = str(item.get("note") or "").strip()
    created_at = str(item.get("created_at") or "").replace("T", " ").replace("Z", "")
    label_map = {
        "TOPUP_APPROVED": _tr(locale, "Recarga aprobada", "Top-up approved"),
        "ORDER_PAYMENT": _tr(locale, "Compra con saldo", "Wallet purchase"),
        "ORDER_REFUND": _tr(locale, "Reembolso a saldo", "Refund to balance"),
        "ADMIN_ADJUSTMENT": _tr(locale, "Ajuste manual", "Manual adjustment"),
    }
    tx_type = str(item.get("transaction_type") or "").upper()
    tx_label = label_map.get(tx_type, tx_type or "-")
    line = f"{prefix} <b>{tx_label}</b> · {_fmt_usd(item.get('amount'))}"
    if note:
        line += f"\n📝 {note}"
    if created_at:
        line += f"\n🕒 {created_at}"
    return line


async def _render_wallet_topup_methods(
    target: Message,
    user_id: int,
    topup_ref: str,
    amount: float,
    locale: str | None = "es",
) -> None:
    payload = await _get_payment_methods_payload()
    methods = payload.get("methods") if isinstance(payload, dict) else []
    if not isinstance(methods, list):
        methods = []
    text = _tr(
        locale,
        f"💳 <b>Recarga creada</b>\n\nReferencia: <code>{topup_ref}</code>\nMonto: <b>{_fmt_usd(amount)}</b>\n\nElige ahora el método de pago:",
        f"💳 <b>Top-up created</b>\n\nReference: <code>{topup_ref}</code>\nAmount: <b>{_fmt_usd(amount)}</b>\n\nChoose the payment method now:",
    )
    reply_markup = _wallet_topup_methods_keyboard(topup_ref, methods, locale)
    header_image_url = await _get_payment_methods_header_image(payload)
    if header_image_url:
        await render_main_view_with_photo(
            target,
            user_id,
            text,
            header_image_url,
            reply_markup=reply_markup,
            parse_mode=ParseMode.HTML,
        )
        return
    await render_main_view(
        target,
        user_id,
        text,
        reply_markup=reply_markup,
        parse_mode=ParseMode.HTML,
    )


async def _render_wallet_topup_crypto_menu(
    target: Message,
    user_id: int,
    topup_ref: str,
    locale: str | None = "es",
) -> None:
    method = await _find_payment_method("crypto")
    method_image = _get_payment_method_image("crypto", method)
    reply_markup = _wallet_crypto_assets_keyboard(topup_ref, locale)
    text = _tr(
        locale,
        "🪙 <b>Elige la red de cripto</b>\n\nSelecciona la cripto que quieres usar para esta recarga.",
        "🪙 <b>Choose the crypto network</b>\n\nSelect the crypto asset you want to use for this top-up.",
    )
    if method_image:
        await render_main_view_with_photo(
            target,
            user_id,
            text,
            method_image,
            reply_markup=reply_markup,
            parse_mode=ParseMode.HTML,
        )
        return
    await render_main_view(
        target,
        user_id,
        text,
        reply_markup=reply_markup,
        parse_mode=ParseMode.HTML,
    )


async def _render_wallet_crypto_asset_details(
    target: Message,
    user_id: int,
    topup_ref: str,
    amount: float,
    asset_key: str,
    locale: str | None = "es",
) -> None:
    method = await _find_payment_method("crypto")
    destinations = _extract_crypto_destinations(method)
    description_text = str((method or {}).get("description") or "").replace("\n", " ").strip()
    wallet = ""
    send_str = ""
    if asset_key == "btc":
        wallet = destinations.get("btc") or ""
        try:
            rate = await usd_to_btc_rate()
            send_amount = amount * rate
            send_str = f"{send_amount:.8f} BTC"
        except Exception:
            send_str = _tr(locale, "No disponible ahora para BTC.", "Currently unavailable for BTC.")
    elif asset_key == "ltc":
        wallet = destinations.get("ltc") or ""
        try:
            rate = await usd_to_ltc_rate()
            send_amount = amount * rate
            send_str = f"{send_amount:.8f} LTC"
        except Exception:
            send_str = _tr(locale, "No disponible ahora para LTC.", "Currently unavailable for LTC.")
    elif asset_key == "usdt_tron":
        wallet = destinations.get("usdt_tron") or ""
        send_str = f"{amount:.2f} USDT (TRON)"
    elif asset_key == "usdt_bsc":
        wallet = destinations.get("usdt_bsc") or ""
        send_str = f"{amount:.2f} USDT (BSC)"
    title = {
        "btc": "₿ BTC",
        "usdt_tron": "₮ USDT Tron",
        "usdt_bsc": "₮ USDT BSC",
        "ltc": "Ł LTC",
    }.get(asset_key, "🪙 Cripto")
    text = (
        f"{title}\n\n"
        f"💼 {_tr(locale, 'Wallet:', 'Wallet:')} <code>{html.escape(wallet or '-')}</code>\n\n"
        f"{_wallet_method_separator()}\n"
        f"💰 {_tr(locale, 'Monto:', 'Amount:')} <b>{_fmt_usd(amount)}</b>\n"
        f"➡️ {_tr(locale, 'Enviar:', 'Send:')} <b>{send_str}</b>\n"
        f"{_wallet_method_separator()}\n\n"
    )
    if description_text:
        text += f"📝 {html.escape(description_text)}\n\n"
    text += (
        f"{_wallet_topup_warning_line()}\n\n"
        f"{_tr(locale, '📩 Luego de pagar, envía la captura aquí mismo para confirmar ✅', '📩 After paying, send the screenshot here to confirm ✅')}\n"
        f"{_tr(locale, '⚠️ Preferiblemente captura de pantalla (no foto).', '⚠️ Preferably a screenshot (not a photo).')}"
    )
    asset_image = _get_crypto_asset_image(asset_key, method)
    keyboard = _wallet_topup_pay_keyboard(
        topup_ref,
        locale,
        back_callback_data=f"wallet:topup:crypto:{topup_ref}",
    )
    if asset_image:
        await render_main_view_with_photo(
            target,
            user_id,
            text,
            asset_image,
            reply_markup=keyboard,
            parse_mode=ParseMode.HTML,
        )
        return
    await render_main_view(
        target,
        user_id,
        text,
        reply_markup=keyboard,
        parse_mode=ParseMode.HTML,
    )


async def _send_wallet_home(target: Message, user_id: int, locale: str | None = "es") -> None:
    payload = await api_client.get_wallet(user_id)
    wallet = payload.get("wallet") or {}
    user = payload.get("user") or {}
    balance = _fmt_usd(wallet.get("balance"))
    username = str(user.get("telegram_username") or "").strip()
    text = _tr(
        locale,
        "💰 <b>Mi saldo</b>\n\n"
        f"ID: {user_id}\n"
        f"Usuario: <b>{('@' + username) if username else '-'}</b>\n\n"
        f"Saldo disponible: <code>{balance}</code>",
        "💰 <b>My balance</b>\n\n"
        f"ID: {user_id}\n"
        f"User: <b>{('@' + username) if username else '-'}</b>\n\n"
        f"Available balance: <code>{balance}</code>",
    )
    image = await get_bot_asset_image(api_client, "wallet_image_url")
    if image:
        await render_main_view_with_photo(
            target,
            user_id,
            text,
            image,
            reply_markup=_wallet_home_keyboard(locale),
            parse_mode=ParseMode.HTML,
        )
        return
    await render_main_view(target, user_id, text, reply_markup=_wallet_home_keyboard(locale), parse_mode=ParseMode.HTML)


async def _cancel_wallet_flow_from_message(message: Message, state: FSMContext, locale: str | None) -> None:
    await state.clear()
    await message.answer(
        _tr(
            locale,
            "ℹ️ Proceso de recarga cancelado.",
            "ℹ️ Top-up flow cancelled.",
        ),
        parse_mode=ParseMode.HTML,
    )


@router.callback_query(F.data == "home:wallet")
async def handle_wallet_home(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(api_client, callback.from_user.id, callback.from_user.language_code)
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            _tr(locale, f"Espera {wait_seconds}s para continuar.", f"Wait {wait_seconds}s to continue."),
            show_alert=True,
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    await state.clear()
    await _send_wallet_home(callback.message, callback.from_user.id, locale)
    await callback.answer()


@router.callback_query(F.data == "wallet:history")
async def handle_wallet_history(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await _render_wallet_history_page(callback, page=1)
    await callback.answer()


async def _render_wallet_history_page(callback: CallbackQuery, page: int) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(api_client, callback.from_user.id, callback.from_user.language_code)
    payload = await api_client.get_wallet_history(
        callback.from_user.id,
        limit=WALLET_HISTORY_FETCH_LIMIT,
    )
    items = payload.get("items") or []
    total_items = len(items)
    total_pages = max((total_items + WALLET_HISTORY_PAGE_SIZE - 1) // WALLET_HISTORY_PAGE_SIZE, 1)
    current_page = max(1, min(page, total_pages))
    start = (current_page - 1) * WALLET_HISTORY_PAGE_SIZE
    page_items = items[start : start + WALLET_HISTORY_PAGE_SIZE]
    if items:
        lines = [
            _tr(locale, "📜 <b>Historial de movimientos</b>", "📜 <b>Wallet history</b>"),
            "",
        ]
        for item in page_items:
            lines.append(_format_history_item(item, locale))
            lines.append("")
        if total_pages > 1:
            lines.append(
                _tr(
                    locale,
                    f"Página {current_page}/{total_pages}",
                    f"Page {current_page}/{total_pages}",
                )
            )
        text = "\n".join(lines).strip()
    else:
        text = _tr(
            locale,
            "📜 <b>Historial de movimientos</b>\n\nAún no tienes movimientos visibles.",
            "📜 <b>Wallet history</b>\n\nYou don't have visible movements yet.",
        )
    history_image = await get_bot_asset_image(api_client, "wallet_history_image_url")
    if history_image:
        await render_main_view_with_photo(
            callback.message,
            callback.from_user.id,
            text,
            history_image,
            reply_markup=_wallet_history_keyboard(current_page, total_pages, locale),
            parse_mode=ParseMode.HTML,
        )
        return
    await render_main_view(callback.message, callback.from_user.id, text, reply_markup=_wallet_history_keyboard(current_page, total_pages, locale), parse_mode=ParseMode.HTML)


@router.callback_query(F.data.startswith("wallet:history:page:"))
async def handle_wallet_history_page(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    try:
        page = int(str(callback.data).split(":")[-1])
    except (TypeError, ValueError):
        page = 1
    await _render_wallet_history_page(callback, page=page)
    await callback.answer()


@router.callback_query(F.data == "wallet:history:noop")
async def handle_wallet_history_noop(callback: CallbackQuery) -> None:
    await callback.answer()


@router.callback_query(F.data == "wallet:topup")
async def handle_wallet_topup_start(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(api_client, callback.from_user.id, callback.from_user.language_code)
    await state.set_state(WalletStates.awaiting_topup_amount)
    text = _tr(
        locale,
        "💳 <b>Recargar saldo</b>\n\nEnvía el monto en USD que quieres recargar.\n\nMínimo: <b>15 USD</b>\n\nEjemplo: 20",
        "💳 <b>Top up balance</b>\n\nSend the USD amount you want to add.\n\nMinimum: <b>15 USD</b>\n\nExample: 20",
    )
    image = await get_bot_asset_image(api_client, "wallet_topup_image_url")
    if image:
        await render_main_view_with_photo(
            callback.message,
            callback.from_user.id,
            text,
            image,
            reply_markup=_wallet_topup_amount_keyboard(locale),
            parse_mode=ParseMode.HTML,
        )
    else:
        await render_main_view(
            callback.message,
            callback.from_user.id,
            text,
            reply_markup=_wallet_topup_amount_keyboard(locale),
            parse_mode=ParseMode.HTML,
        )
    await callback.answer()


@router.message(WalletStates.awaiting_topup_amount)
async def handle_wallet_topup_amount(message: Message, state: FSMContext) -> None:
    if not message.from_user:
        return
    locale = await get_user_locale(api_client, message.from_user.id, message.from_user.language_code)
    raw_original = str(message.text or "").strip()
    if raw_original.startswith("/"):
        await _cancel_wallet_flow_from_message(message, state, locale)
        if raw_original.lower() in {"/cancel", "/wallet", "/saldo"}:
            await _send_wallet_home(message, message.from_user.id, locale)
        return
    raw = raw_original.replace(",", ".")
    previous_feedback_id = (await state.get_data()).get("wallet_topup_feedback_message_id")
    if previous_feedback_id:
        try:
            await message.bot.delete_message(message.chat.id, int(previous_feedback_id))
        except Exception:
            pass
    try:
        amount = float(raw)
    except (TypeError, ValueError):
        try:
            await message.delete()
        except Exception:
            pass
        feedback = await message.answer(
            _tr(locale, "❌ Envía un monto válido en USD.", "❌ Send a valid amount in USD."),
            parse_mode=ParseMode.HTML,
        )
        await state.update_data(wallet_topup_feedback_message_id=feedback.message_id)
        return
    result = await api_client.create_wallet_topup(message.from_user.id, amount)
    if result.get("status_code") == 400:
        try:
            await message.delete()
        except Exception:
            pass
        feedback = await message.answer(
            _tr(locale, "⚠️ El monto mínimo de recarga es 15 USD.", "⚠️ The minimum top-up amount is 15 USD."),
            parse_mode=ParseMode.HTML,
        )
        await state.update_data(wallet_topup_feedback_message_id=feedback.message_id)
        return

    topup = result.get("topup") or {}
    topup_ref = str(topup.get("topup_number_label") or topup.get("id") or "").strip()
    payload = await _get_payment_methods_payload()
    methods = payload.get("methods") if isinstance(payload, dict) else []
    if not isinstance(methods, list):
        methods = []
    await state.update_data(
        wallet_topup_ref=topup_ref,
        wallet_topup_id=topup.get("id"),
        wallet_topup_amount=amount,
        wallet_payment_method=None,
        wallet_topup_feedback_message_id=None,
    )
    await _render_wallet_topup_methods(
        message,
        message.from_user.id,
        topup_ref,
        amount,
        locale,
    )
    try:
        await message.delete()
    except Exception:
        pass


@router.callback_query(F.data.startswith("wallet:topup:methods:"))
async def handle_wallet_topup_methods_back(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(api_client, callback.from_user.id, callback.from_user.language_code)
    topup_ref = str(callback.data).split(":")[-1]
    data = await state.get_data()
    amount = float(data.get("wallet_topup_amount") or 0)
    if amount <= 0:
        await callback.answer(
            _tr(locale, "⚠️ No encontré una recarga activa.", "⚠️ I couldn't find an active top-up."),
            show_alert=True,
        )
        return
    await _render_wallet_topup_methods(
        callback.message,
        callback.from_user.id,
        topup_ref,
        amount,
        locale,
    )
    await callback.answer()


@router.callback_query(F.data.startswith("wallet:topup:crypto:"))
async def handle_wallet_topup_crypto_back(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(api_client, callback.from_user.id, callback.from_user.language_code)
    topup_ref = str(callback.data).split(":")[-1]
    data = await state.get_data()
    amount = float(data.get("wallet_topup_amount") or 0)
    if amount <= 0:
        await callback.answer(
            _tr(locale, "⚠️ No encontré una recarga activa.", "⚠️ I couldn't find an active top-up."),
            show_alert=True,
        )
        return
    await _render_wallet_topup_crypto_menu(
        callback.message,
        callback.from_user.id,
        topup_ref,
        locale,
    )
    await callback.answer()


@router.callback_query(F.data.startswith("wallet:topup:method:"))
async def handle_wallet_topup_method(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(api_client, callback.from_user.id, callback.from_user.language_code)
    _, _, _, topup_ref, selector = callback.data.split(":", 4)
    payload = await _get_payment_methods_payload()
    methods = payload.get("methods") if isinstance(payload, dict) else []
    if not isinstance(methods, list):
        methods = []
    enabled_methods = [item for item in methods if bool(item.get("enabled", True))]
    try:
        index = int(selector)
    except ValueError:
        index = 0
    if index < 1 or index > len(enabled_methods):
        await callback.answer(_tr(locale, "Método inválido.", "Invalid method."), show_alert=True)
        return
    method = enabled_methods[index - 1]
    method_key = str(method.get("key") or "").lower()
    amount = float((await state.get_data()).get("wallet_topup_amount") or 0)
    await state.update_data(wallet_topup_ref=topup_ref, wallet_payment_method=str(method.get("key") or ""))
    if method_key == "crypto":
        await _render_wallet_topup_crypto_menu(
            callback.message,
            callback.from_user.id,
            topup_ref,
            locale,
        )
        await callback.answer()
        return
    text = await _build_wallet_topup_method_text(
        method_key,
        amount,
        locale,
        method=method,
    )
    method_image = _get_payment_method_image(method_key, method)
    if method_image:
        await render_main_view_with_photo(
            callback.message,
            callback.from_user.id,
            text,
            method_image,
            reply_markup=_wallet_topup_pay_keyboard(
                topup_ref,
                locale,
                back_callback_data=f"wallet:topup:methods:{topup_ref}",
            ),
            parse_mode=ParseMode.HTML,
        )
    else:
        await render_main_view(
            callback.message,
            callback.from_user.id,
            text,
            reply_markup=_wallet_topup_pay_keyboard(
                topup_ref,
                locale,
                back_callback_data=f"wallet:topup:methods:{topup_ref}",
            ),
            parse_mode=ParseMode.HTML,
        )
    await callback.answer()


@router.callback_query(F.data.startswith("wallet:topup:cryptoasset:"))
async def handle_wallet_topup_crypto_asset(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(api_client, callback.from_user.id, callback.from_user.language_code)
    parts = str(callback.data).split(":")
    if len(parts) < 5:
        await callback.answer(
            _tr(locale, "⚠️ Opción inválida.", "⚠️ Invalid option."),
            show_alert=True,
        )
        return
    topup_ref = parts[3]
    asset_key = parts[4]
    data = await state.get_data()
    amount = float(data.get("wallet_topup_amount") or 0)
    if amount <= 0:
        await callback.answer(
            _tr(locale, "⚠️ No encontré una recarga activa.", "⚠️ I couldn't find an active top-up."),
            show_alert=True,
        )
        return
    asset_method_map = {
        "btc": "BTC",
        "usdt_tron": "USDT_TRON",
        "usdt_bsc": "USDT_BSC",
        "ltc": "LTC",
    }
    await state.update_data(
        wallet_topup_ref=topup_ref,
        wallet_payment_method=asset_method_map.get(asset_key, asset_key.upper()),
    )
    await _render_wallet_crypto_asset_details(
        callback.message,
        callback.from_user.id,
        topup_ref,
        amount,
        asset_key,
        locale,
    )
    await callback.answer()


@router.callback_query(F.data.startswith("wallet:topup:pay:"))
async def handle_wallet_topup_pay(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(api_client, callback.from_user.id, callback.from_user.language_code)
    topup_ref = callback.data.split(":")[-1]
    data = await state.get_data()
    payment_method = str(data.get("wallet_payment_method") or "").strip()
    if not payment_method:
        await callback.answer(
            _tr(locale, "⚠️ Primero elige un método de pago.", "⚠️ Choose a payment method first."),
            show_alert=True,
        )
        return
    await state.update_data(wallet_topup_ref=topup_ref)
    if callback.message:
        await state.update_data(wallet_topup_prompt_message_id=callback.message.message_id)
    await state.set_state(WalletStates.awaiting_topup_proof)
    await render_main_view(
        callback.message,
        callback.from_user.id,
        _tr(
            locale,
            "📸 Envíame la captura del pago aquí mismo para confirmar. 😊\n\n"
            "⚠️ Recomendado: usa captura de pantalla completa (no foto) para que el sistema detecte bien método y monto.\n\n"
            "⏳ Tienes 10 minutos para enviarla o tu orden será cancelada.",
            "📸 Send me the payment screenshot right here to confirm. 😊\n\n"
            "⚠️ Recommended: use a full screenshot (not a photo) so the system can detect method and amount correctly.\n\n"
            "⏳ You have 10 minutes to send it or your order will be cancelled.",
        ),
        reply_markup=None,
        parse_mode=ParseMode.HTML,
    )
    await callback.answer()


async def _submit_topup_proof(
    message: Message,
    state: FSMContext,
    file_id: str,
    unique_id: str,
) -> None:
    if not message.from_user:
        return
    locale = await get_user_locale(api_client, message.from_user.id, message.from_user.language_code)
    data = await state.get_data()
    topup_ref = str(data.get("wallet_topup_ref") or "").strip()
    payment_method = str(data.get("wallet_payment_method") or "").strip()
    if not topup_ref or not payment_method:
        await state.clear()
        await message.answer(
            _tr(locale, "⚠️ No encontré una recarga activa.", "⚠️ I couldn't find an active top-up."),
            parse_mode=ParseMode.HTML,
        )
        return
    analyzing_notice = await message.answer(_build_analysis_notice_text(locale, 3))
    analysis_animation_task: asyncio.Task[Any] | None = asyncio.create_task(
        _animate_analysis_notice(analyzing_notice, locale)
    )
    try:
        result = await api_client.submit_wallet_topup_proof(
            topup_ref,
            {
                "telegram_id": message.from_user.id,
                "screenshot_file_id": file_id,
                "screenshot_unique_id": unique_id,
                "payment_method": payment_method,
            },
        )
    finally:
        await _cleanup_analysis_notice(analyzing_notice, analysis_animation_task)
    if result.get("status_code") == 409:
        error_code = (result.get("data") or {}).get("error")
        if error_code == "SCREENSHOT_ALREADY_SUBMITTED":
            await message.answer(
                _tr(locale, "⚠️ Ya habías enviado una captura para esta recarga.", "⚠️ You already submitted a screenshot for this top-up."),
                parse_mode=ParseMode.HTML,
            )
            return
        if error_code == "DUPLICATE_IMAGE":
            await message.answer(
                _tr(locale, "⚠️ Ya habías usado esa misma imagen. Envía otra captura.", "⚠️ You already used that same image. Send a different screenshot."),
                parse_mode=ParseMode.HTML,
            )
            return
        await message.answer(
            _tr(locale, "⚠️ Esa recarga ya no acepta comprobante o ya expiró.", "⚠️ That top-up no longer accepts proof or it already expired."),
            parse_mode=ParseMode.HTML,
        )
        return
    if result.get("status_code") == 422:
        backend_message = (result.get("data") or {}).get("message")
        try:
            await message.delete()
        except Exception:
            pass
        await message.answer(
            backend_message
            or _tr(
                locale,
                "⚠️ La imagen no parece un comprobante de pago. Envía una captura donde se vea método y monto.",
                "⚠️ The image does not look like a payment receipt. Send a screenshot showing method and amount.",
            ),
            parse_mode=ParseMode.HTML,
        )
        return
    prompt_message_id = data.get("wallet_topup_prompt_message_id")
    if prompt_message_id:
        try:
            await message.bot.delete_message(message.chat.id, int(prompt_message_id))
        except Exception:
            pass
    await state.clear()
    await message.answer(
        _tr(
            locale,
            "✅ ¡Pago recibido! Estamos verificándolo en este momento 🔎⏳\n\n"
            "🛡️ Tu pago está pendiente de validación por parte de un administrador para poder liberar la orden.\n\n"
            "🙏 Te pedimos un poco de paciencia, ya que este proceso puede tardar 30 minutos o más.",
            "✅ Payment received! We are verifying it right now 🔎⏳\n\n"
            "🛡️ Your payment is pending admin validation before the order can be released.\n\n"
            "🙏 Please be patient, this process may take 30 minutes or more.",
        ),
        parse_mode=ParseMode.HTML,
        reply_markup=_wallet_topup_submitted_keyboard(locale),
    )


@router.message(WalletStates.awaiting_topup_proof, F.text)
async def handle_wallet_topup_proof_text(message: Message, state: FSMContext) -> None:
    if not message.from_user:
        return
    locale = await get_user_locale(api_client, message.from_user.id, message.from_user.language_code)
    raw = str(message.text or "").strip()
    if raw.startswith("/"):
        await _cancel_wallet_flow_from_message(message, state, locale)
        if raw.lower() in {"/cancel", "/wallet", "/saldo"}:
            await _send_wallet_home(message, message.from_user.id, locale)
        return
    await message.answer(
        _tr(
            locale,
            "❌ Envía una imagen o captura del comprobante.",
            "❌ Send an image or screenshot of the receipt.",
        ),
        parse_mode=ParseMode.HTML,
    )


@router.message(WalletStates.awaiting_topup_proof, F.photo)
async def handle_wallet_topup_photo(message: Message, state: FSMContext) -> None:
    if not message.photo:
        return
    await _submit_topup_proof(message, state, message.photo[-1].file_id, message.photo[-1].file_unique_id)


@router.message(WalletStates.awaiting_topup_proof, F.document)
async def handle_wallet_topup_document(message: Message, state: FSMContext) -> None:
    if not message.document:
        return
    if not message.document.mime_type or not message.document.mime_type.startswith("image/"):
        return
    await _submit_topup_proof(message, state, message.document.file_id, message.document.file_unique_id)
