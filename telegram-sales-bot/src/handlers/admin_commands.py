import asyncio
from datetime import datetime
import html
from typing import Any, Dict, Optional

import httpx
from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from ..config import (
    ADMIN_API_KEY,
    ADMIN_TELEGRAM_IDS,
    API_BASE_URL,
    API_TOKEN,
    BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    BOT_RATE_LIMIT_ENABLED,
    BOT_RATE_LIMIT_SECONDS,
    BOT_TO_API_SECRET,
)
from ..services.api_client import ApiClient
from ..services.i18n import t
from ..services.user_locale import get_user_locale
from ..utils.rate_limit import check_global_rate_limit

router = Router()
api_client = ApiClient(API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET)


class AdminUiStates(StatesGroup):
    awaiting_value = State()


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
    if isinstance(value, str):
        return value.replace("T", " ")[:19]
    if isinstance(value, datetime):
        return value.isoformat(sep=" ", timespec="seconds")
    return str(value)


def _escape_html(value: Any) -> str:
    return html.escape(str(value if value is not None else "-"))


def _fmt_amount(value: Any, digits: int = 2) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "-"
    return f"{number:,.{digits}f}"


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


def _build_admin_panel_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="📋 Pendientes", callback_data="adminui:orders"),
                InlineKeyboardButton(text="🔎 Ver orden", callback_data="adminui:order"),
                InlineKeyboardButton(text="✅ Aprobar", callback_data="adminui:approve"),
            ],
            [
                InlineKeyboardButton(text="❌ Rechazar", callback_data="adminui:reject"),
                InlineKeyboardButton(text="💸 Reembolso", callback_data="adminui:refund"),
                InlineKeyboardButton(text="🚫 Banear", callback_data="adminui:ban"),
            ],
            [
                InlineKeyboardButton(text="♻️ Desbanear", callback_data="adminui:unban"),
                InlineKeyboardButton(text="🛠 Mantenimiento", callback_data="adminui:maint"),
                InlineKeyboardButton(text="📣 Broadcast", callback_data="adminui:broadcast"),
            ],
            [
                InlineKeyboardButton(text="📜 Logs", callback_data="adminui:logs"),
                InlineKeyboardButton(text="📊 Estado", callback_data="adminui:status"),
                InlineKeyboardButton(text="❓ Ayuda", callback_data="adminui:home"),
            ],
        ]
    )


def _build_admin_panel_text() -> str:
    return (
        "🧩 <b>Panel Admin del Bot</b>\n\n"
        "Selecciona una acción desde los botones.\n\n"
        "📌 Todo el flujo está guiado paso a paso.\n"
        "🛑 Puedes cancelar en cualquier momento con <code>/cancel</code>."
    )


def _build_orders_limit_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="5", callback_data="adminui:orders:list:5"),
                InlineKeyboardButton(text="10", callback_data="adminui:orders:list:10"),
                InlineKeyboardButton(text="20", callback_data="adminui:orders:list:20"),
            ],
            [
                InlineKeyboardButton(text="30", callback_data="adminui:orders:list:30"),
                InlineKeyboardButton(text="⬅️ Panel", callback_data="adminui:home"),
            ],
        ]
    )


def _build_maint_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="🟢 ON", callback_data="adminui:maint:set:on"),
                InlineKeyboardButton(text="🔴 OFF", callback_data="adminui:maint:set:off"),
                InlineKeyboardButton(text="⬅️ Panel", callback_data="adminui:home"),
            ]
        ]
    )


def _build_logs_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Payments 10", callback_data="adminui:logs:list:payments:10"
                ),
                InlineKeyboardButton(
                    text="Errors 10", callback_data="adminui:logs:list:errors:10"
                ),
                InlineKeyboardButton(
                    text="Support 10", callback_data="adminui:logs:list:support:10"
                ),
            ],
            [
                InlineKeyboardButton(
                    text="Payments 20", callback_data="adminui:logs:list:payments:20"
                ),
                InlineKeyboardButton(
                    text="Errors 20", callback_data="adminui:logs:list:errors:20"
                ),
                InlineKeyboardButton(
                    text="Support 20", callback_data="adminui:logs:list:support:20"
                ),
            ],
            [
                InlineKeyboardButton(text="⬅️ Panel", callback_data="adminui:home"),
            ],
        ]
    )


def _guide_text(action: str) -> str:
    guides = {
        "orders": (
            "📋 <b>Órdenes Pendientes</b>\n\n"
            "Visualiza las órdenes que están en espera de revisión de pago.\n\n"
            "✍️ Ejemplo en texto:\n"
            "<code>/orders pending 10</code>\n\n"
            "🎯 Ahora elige cuántas quieres listar:"
        ),
        "order": (
            "🔎 <b>Ver Orden</b>\n"
            "Envía ahora el <b>order number</b> corto o el UUID.\n\n"
            "✍️ Ejemplos:\n"
            "<code>00004</code>\n"
            "<code>47f78e05-7086-4504-afb4-04da86acc2d9</code>"
        ),
        "approve": (
            "✅ <b>Aprobar Orden</b>\n"
            "Envía ahora el order number o UUID para aprobar la orden.\n\n"
            "✍️ Ejemplo:\n"
            "<code>00004</code>"
        ),
        "reject": (
            "❌ <b>Rechazar Orden</b>\n"
            "Envía ahora el order number o UUID para rechazar la orden.\n\n"
            "✍️ Ejemplo:\n"
            "<code>00004</code>"
        ),
        "refund": (
            "💸 <b>Reembolso</b>\n"
            "Envía ahora el order number o UUID para iniciar reembolso.\n\n"
            "✍️ Ejemplo:\n"
            "<code>00004</code>"
        ),
        "ban": (
            "🚫 <b>Banear Usuario</b>\n"
            "Envía ahora el telegram_id del usuario a banear.\n\n"
            "✍️ Ejemplo:\n"
            "<code>7621162350</code>"
        ),
        "unban": (
            "♻️ <b>Desbanear Usuario</b>\n"
            "Envía ahora el telegram_id del usuario a desbanear.\n\n"
            "✍️ Ejemplo:\n"
            "<code>7621162350</code>"
        ),
        "maint": (
            "🛠 <b>Mantenimiento</b>\n"
            "Activa o desactiva el mantenimiento global.\n\n"
            "🎯 Selecciona ON u OFF:"
        ),
        "broadcast": (
            "📣 <b>Broadcast</b>\n"
            "Envía ahora el texto del mensaje masivo.\n\n"
            "✍️ Ejemplo:\n"
            "<code>Nuevo aviso importante para todos los usuarios.</code>"
        ),
        "logs": (
            "📜 <b>Logs</b>\n"
            "Consulta eventos recientes por categoría.\n\n"
            "🎯 Selecciona categoría y cantidad:"
        ),
        "status": (
            "📊 <b>Estado</b>\n"
            "Consulta el estado general de la API y los contadores principales."
        ),
    }
    return guides.get(action, _build_admin_panel_text())


async def _ensure_admin_http(message: Message) -> bool:
    if _admin_http_configured():
        return True
    await message.answer("⚠️ Falta API_TOKEN o ADMIN_API_KEY en `telegram-sales-bot/.env`.")
    return False


async def _send_status(message: Message) -> None:
    health, maintenance, counts = await asyncio.gather(
        api_client.ping_health(),
        api_client.admin_get_maintenance(),
        api_client.admin_get_order_status_counts(),
    )
    waiting = counts.get("counts", {}).get("WAITING_PAYMENT", 0)
    paid = counts.get("counts", {}).get("PAID", 0)
    delivered = counts.get("counts", {}).get("DELIVERED", 0)
    cancelled = counts.get("counts", {}).get("CANCELLED", 0)
    text = (
        "📊 <b>Estado del Sistema</b>\n\n"
        f"🧠 API: <b>{'OK' if health.get('ok') else 'ERROR'}</b>\n"
        f"🛠 Mantenimiento: <b>{'ON' if maintenance.get('active') else 'OFF'}</b>\n\n"
        "🧾 <b>Órdenes</b>\n"
        f"• ⏳ Pendientes de pago: <b>{waiting}</b>\n"
        f"• ✅ Pagadas: <b>{paid}</b>\n"
        f"• 📦 Entregadas: <b>{delivered}</b>\n"
        f"• ❌ Canceladas: <b>{cancelled}</b>"
    )
    await message.answer(text, parse_mode="HTML")


async def _send_orders_pending(message: Message, limit: int) -> None:
    response = await api_client.admin_list_orders(
        status="WAITING_PAYMENT", page=1, page_size=limit
    )
    items = response.get("items", [])
    if not items:
        await message.answer("✅ <b>No hay órdenes pendientes</b> en este momento.", parse_mode="HTML")
        return
    lines = [f"📋 <b>Órdenes pendientes</b>: <b>{len(items)}</b>\n"]
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
    await message.answer("\n".join(lines), parse_mode="HTML")


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
        f"🏷 Número: <b>#{order_number_text}</b>\n"
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


async def _send_logs(message: Message, category: str, limit: int) -> None:
    data = await api_client.admin_get_logs(category=category, limit=limit)
    items = data.get("items", [])
    if not items:
        await message.answer(
            f"ℹ️ <b>Sin registros</b> en la categoría <code>{_escape_html(category)}</code>.",
            parse_mode="HTML",
        )
        return
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
    await message.answer("\n".join(lines), parse_mode="HTML")


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
    await message.answer(
        _build_admin_panel_text(),
        reply_markup=_build_admin_panel_keyboard(),
        parse_mode="HTML",
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

    if action == "home":
        await state.clear()
        await callback.message.answer(
            _build_admin_panel_text(),
            reply_markup=_build_admin_panel_keyboard(),
            parse_mode="HTML",
        )
        await callback.answer()
        return

    if not await _ensure_admin_http(callback.message):
        await callback.answer()
        return

    try:
        if action == "status":
            await state.clear()
            await callback.message.answer(_guide_text("status"), parse_mode="HTML")
            await _send_status(callback.message)
            await callback.answer()
            return

        if action == "orders":
            if len(parts) >= 4 and parts[2] == "list":
                limit = _safe_int(parts[3], 10, 1, 30)
                await state.clear()
                await _send_orders_pending(callback.message, limit)
            else:
                await state.clear()
                await callback.message.answer(
                    _guide_text("orders"),
                    reply_markup=_build_orders_limit_keyboard(),
                    parse_mode="HTML",
                )
            await callback.answer()
            return

        if action == "order":
            await state.set_state(AdminUiStates.awaiting_value)
            await state.update_data(admin_ui_action="order_ref_view")
            await callback.message.answer(_guide_text("order"), parse_mode="HTML")
            await callback.answer()
            return

        if action == "approve":
            await state.set_state(AdminUiStates.awaiting_value)
            await state.update_data(admin_ui_action="order_ref_approve")
            await callback.message.answer(_guide_text("approve"), parse_mode="HTML")
            await callback.answer()
            return

        if action == "reject":
            await state.set_state(AdminUiStates.awaiting_value)
            await state.update_data(admin_ui_action="order_ref_reject")
            await callback.message.answer(_guide_text("reject"), parse_mode="HTML")
            await callback.answer()
            return

        if action == "refund":
            await state.set_state(AdminUiStates.awaiting_value)
            await state.update_data(admin_ui_action="order_ref_refund")
            await callback.message.answer(_guide_text("refund"), parse_mode="HTML")
            await callback.answer()
            return

        if action == "ban":
            await state.set_state(AdminUiStates.awaiting_value)
            await state.update_data(admin_ui_action="ban_telegram_id")
            await callback.message.answer(_guide_text("ban"), parse_mode="HTML")
            await callback.answer()
            return

        if action == "unban":
            await state.set_state(AdminUiStates.awaiting_value)
            await state.update_data(admin_ui_action="unban_telegram_id")
            await callback.message.answer(_guide_text("unban"), parse_mode="HTML")
            await callback.answer()
            return

        if action == "maint":
            if len(parts) >= 4 and parts[2] == "set":
                active = parts[3].lower() == "on"
                await state.clear()
                await _set_maintenance(callback.message, active)
            else:
                await state.clear()
                await callback.message.answer(
                    _guide_text("maint"),
                    reply_markup=_build_maint_keyboard(),
                    parse_mode="HTML",
                )
            await callback.answer()
            return

        if action == "broadcast":
            await state.set_state(AdminUiStates.awaiting_value)
            await state.update_data(admin_ui_action="broadcast_message")
            await callback.message.answer(_guide_text("broadcast"), parse_mode="HTML")
            await callback.answer()
            return

        if action == "logs":
            if len(parts) >= 5 and parts[2] == "list":
                category = parts[3].lower()
                if category not in {"errors", "payments", "support"}:
                    await callback.message.answer("❌ <b>Categoría inválida.</b>", parse_mode="HTML")
                    await callback.answer()
                    return
                limit = _safe_int(parts[4], 10, 1, 25)
                await state.clear()
                await _send_logs(callback.message, category, limit)
            else:
                await state.clear()
                await callback.message.answer(
                    _guide_text("logs"),
                    reply_markup=_build_logs_keyboard(),
                    parse_mode="HTML",
                )
            await callback.answer()
            return

        await callback.message.answer(
            _build_admin_panel_text(),
            reply_markup=_build_admin_panel_keyboard(),
            parse_mode="HTML",
        )
        await callback.answer()
    except httpx.HTTPStatusError as exc:
        try:
            payload = exc.response.json()
        except Exception:
            payload = {}
        await callback.message.answer(
            "❌ <b>Error en la acción del panel</b>\n\n"
            f"Código: <b>{exc.response.status_code}</b>\n"
            f"Detalle: <code>{_escape_html(payload.get('error') or 'ERROR')}</code>",
            parse_mode="HTML",
        )
        await callback.answer()
    except Exception as exc:
        await callback.message.answer(
            "❌ <b>Error del panel admin</b>\n\n"
            f"<code>{_escape_html(exc)}</code>",
            parse_mode="HTML",
        )
        await callback.answer()


@router.message(AdminUiStates.awaiting_value)
async def handle_admin_ui_value(message: Message, state: FSMContext) -> None:
    locale = await _admin_guard(message)
    if not locale:
        return
    if not await _ensure_admin_http(message):
        return

    raw_text = (message.text or "").strip()
    if not raw_text:
        await message.answer(
            "⚠️ <b>Entrada inválida</b>\n\n"
            "Envía un valor válido o escribe <code>/cancel</code>.",
            parse_mode="HTML",
        )
        return

    if raw_text.lower() in {"/cancel", "cancel", "salir"}:
        await state.clear()
        await message.answer(
            "❎ <b>Flujo cancelado.</b>\n\nPuedes abrir el panel nuevamente con <code>/admin</code>.",
            reply_markup=_build_admin_panel_keyboard(),
            parse_mode="HTML",
        )
        return

    data = await state.get_data()
    action = str(data.get("admin_ui_action") or "").strip()

    try:
        if action == "order_ref_view":
            await state.clear()
            await _send_order_detail(message, raw_text)
            return

        if action == "order_ref_approve":
            await state.clear()
            await _approve_order(message, raw_text)
            return

        if action == "order_ref_reject":
            await state.update_data(admin_ui_action="reject_reason", admin_ui_order_ref=raw_text)
            await message.answer(
                "📝 <b>Motivo del rechazo</b>\n\n"
                "Envía el motivo.\n"
                "Ejemplo: <code>Comprobante borroso</code>",
                parse_mode="HTML",
            )
            return

        if action == "reject_reason":
            order_ref = str(data.get("admin_ui_order_ref") or "").strip()
            reason = raw_text or "Comprobante inválido. Envía una nueva captura."
            await state.clear()
            await _reject_order(message, order_ref, reason)
            return

        if action == "order_ref_refund":
            await state.update_data(admin_ui_action="refund_reason", admin_ui_order_ref=raw_text)
            await message.answer(
                "📝 <b>Motivo del reembolso</b>\n\n"
                "Envía el motivo.\n"
                "Ejemplo: <code>Reembolso solicitado por cliente</code>",
                parse_mode="HTML",
            )
            return

        if action == "refund_reason":
            order_ref = str(data.get("admin_ui_order_ref") or "").strip()
            reason = raw_text or "Reembolso procesado por admin."
            await state.clear()
            await _refund_order(message, order_ref, reason)
            return

        if action == "ban_telegram_id":
            try:
                telegram_id = int(raw_text.split()[0])
            except ValueError:
                await message.answer(
                    "❌ <b>telegram_id inválido</b>\n\nEjemplo: <code>7621162350</code>",
                    parse_mode="HTML",
                )
                return
            await state.update_data(admin_ui_action="ban_reason", admin_ui_telegram_id=telegram_id)
            await message.answer(
                "📝 <b>Motivo del ban</b>\n\n"
                "Envía el motivo.\n"
                "Ejemplo: <code>Fraude en comprobantes</code>",
                parse_mode="HTML",
            )
            return

        if action == "ban_reason":
            telegram_id = int(data.get("admin_ui_telegram_id"))
            reason = raw_text or "Baneado por admin."
            await state.clear()
            await _ban_user(message, telegram_id, reason)
            return

        if action == "unban_telegram_id":
            try:
                telegram_id = int(raw_text.split()[0])
            except ValueError:
                await message.answer(
                    "❌ <b>telegram_id inválido</b>\n\nEjemplo: <code>7621162350</code>",
                    parse_mode="HTML",
                )
                return
            await state.clear()
            await _unban_user(message, telegram_id)
            return

        if action == "broadcast_message":
            await state.clear()
            await _send_broadcast(message, raw_text)
            return

        await state.clear()
        await message.answer(
            _build_admin_panel_text(),
            reply_markup=_build_admin_panel_keyboard(),
            parse_mode="HTML",
        )
    except httpx.HTTPStatusError as exc:
        try:
            payload = exc.response.json()
        except Exception:
            payload = {}
        await state.clear()
        await message.answer(
            "❌ <b>Error ejecutando acción</b>\n\n"
            f"Código: <b>{exc.response.status_code}</b>\n"
            f"Detalle: <code>{_escape_html(payload.get('error') or 'ERROR')}</code>",
            parse_mode="HTML",
        )
    except Exception as exc:
        await state.clear()
        await message.answer(
            "❌ <b>Error ejecutando acción</b>\n\n"
            f"<code>{_escape_html(exc)}</code>",
            parse_mode="HTML",
        )


@router.message(Command("astatus"))
async def cmd_astatus(message: Message) -> None:
    locale = await _admin_guard(message)
    if not locale:
        return
    if not _admin_http_configured():
        await message.answer("⚠️ Falta API_TOKEN o ADMIN_API_KEY en `telegram-sales-bot/.env`.")
        return
    try:
        health, maintenance, counts = await asyncio.gather(
            api_client.ping_health(),
            api_client.admin_get_maintenance(),
            api_client.admin_get_order_status_counts(),
        )
        waiting = counts.get("counts", {}).get("WAITING_PAYMENT", 0)
        paid = counts.get("counts", {}).get("PAID", 0)
        delivered = counts.get("counts", {}).get("DELIVERED", 0)
        cancelled = counts.get("counts", {}).get("CANCELLED", 0)
        text = (
            "📊 Estado del sistema\n\n"
            f"API: {'OK' if health.get('ok') else 'ERROR'}\n"
            f"Mantenimiento: {'ON' if maintenance.get('active') else 'OFF'}\n"
            f"Pendientes pago: {waiting}\n"
            f"Pagadas: {paid}\n"
            f"Entregadas: {delivered}\n"
            f"Canceladas: {cancelled}"
        )
        await message.answer(text)
    except Exception as exc:
        await message.answer(f"❌ No pude obtener estado admin: {exc}")


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
