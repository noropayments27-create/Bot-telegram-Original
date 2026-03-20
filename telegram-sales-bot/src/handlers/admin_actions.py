import asyncio
from html import escape as html_escape
from urllib.parse import quote
from urllib.parse import urlparse

import httpx
from aiogram import F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message
import logging
import time

from ..config import (
    ADMIN_PANEL_LOCAL_URL,
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
logger = logging.getLogger(__name__)


class AdminPanelAccessStates(StatesGroup):
    awaiting_password = State()


_ADMIN_PANEL_PENDING_TTL_SECONDS = 180
_admin_panel_pending: dict[int, dict[str, str | float]] = {}
_ADMIN_PANEL_NON_ORDER_KEYS = {"login", "panel", "web", "direct"}


def _set_admin_panel_pending(admin_id: int, order_id: str) -> None:
    _admin_panel_pending[admin_id] = {
        "order_id": order_id,
        "expires_at": time.time() + _ADMIN_PANEL_PENDING_TTL_SECONDS,
    }


def _get_admin_panel_pending(admin_id: int) -> dict[str, str | float] | None:
    pending = _admin_panel_pending.get(admin_id)
    if not pending:
        return None
    expires_at = float(pending.get("expires_at") or 0)
    if expires_at <= time.time():
        _admin_panel_pending.pop(admin_id, None)
        return None
    return pending


def _clear_admin_panel_pending(admin_id: int) -> None:
    _admin_panel_pending.pop(admin_id, None)


def _should_handle_admin_panel_password_fallback(message: Message) -> bool:
    user = message.from_user
    if not user or user.id not in ADMIN_TELEGRAM_IDS:
        return False
    text = (message.text or "").strip()
    if not text or text.startswith("/"):
        return False
    return _get_admin_panel_pending(user.id) is not None


def _build_admin_panel_access_url(token: str, order_id: str | None = None) -> str:
    base = str(ADMIN_PANEL_LOCAL_URL or "").strip()
    if not base:
        base = "http://localhost:3000"
    base = base.rstrip("/")
    login_base = base if base.endswith("/telegram-login") else f"{base}/telegram-login"
    url = f"{login_base}?token={quote(token)}"
    if order_id:
        url += f"&orderId={quote(order_id)}"
    return url


def _is_local_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    host = (parsed.hostname or "").strip().lower()
    return host in {"localhost", "127.0.0.1", "::1"}


def _schedule_message_delete(bot, chat_id: int, message_id: int, delay_seconds: float = 60.0) -> None:
    async def _delete_later() -> None:
        await asyncio.sleep(max(float(delay_seconds), 0.0))
        try:
            await bot.delete_message(chat_id=chat_id, message_id=message_id)
        except Exception:
            pass

    asyncio.create_task(_delete_later())


@router.callback_query(F.data.startswith("admin_panel:"))
async def handle_admin_panel_access(callback: CallbackQuery, state: FSMContext) -> None:
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
    if callback.from_user.id not in ADMIN_TELEGRAM_IDS:
        await callback.answer(t(locale, "admin_not_authorized"), show_alert=True)
        return

    parts = callback.data.split(":")
    raw_order_id = (parts[1] if len(parts) > 1 else "").strip()
    if raw_order_id.lower() in _ADMIN_PANEL_NON_ORDER_KEYS:
        order_id = ""
    else:
        order_id = raw_order_id
    _set_admin_panel_pending(callback.from_user.id, order_id)
    await state.set_state(AdminPanelAccessStates.awaiting_password)
    logger.info(
        "admin_panel_access_requested admin_id=%s order_id=%s",
        callback.from_user.id,
        order_id,
    )
    prompt_message = await callback.message.answer(t(locale, "admin_panel_password_prompt"))
    await state.update_data(
        admin_panel_order_id=order_id,
        admin_panel_prompt_chat_id=prompt_message.chat.id,
        admin_panel_prompt_message_id=prompt_message.message_id,
    )
    await callback.answer()


async def _process_admin_panel_password(
    message: Message, state: FSMContext, password: str
) -> None:
    if not message.from_user:
        return
    locale = await get_user_locale(
        api_client, message.from_user.id, message.from_user.language_code
    )
    if message.from_user.id not in ADMIN_TELEGRAM_IDS:
        _clear_admin_panel_pending(message.from_user.id)
        await state.clear()
        await message.answer(t(locale, "admin_not_authorized"))
        return

    text = password.strip()
    if not text:
        return
    if text.lower() == "/cancel":
        _clear_admin_panel_pending(message.from_user.id)
        await state.clear()
        await message.answer("Proceso cancelado.")
        return

    logger.info(
        "admin_panel_password_received admin_id=%s text_len=%s",
        message.from_user.id,
        len(text),
    )

    # Best-effort: remove password message from chat.
    try:
        await message.delete()
    except Exception:
        pass

    try:
        result = await api_client.admin_auth_direct(text)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 401:
            logger.warning(
                "admin_panel_password_invalid admin_id=%s",
                message.from_user.id,
            )
            await message.answer(t(locale, "admin_panel_password_invalid"))
            return
        logger.exception(
            "admin_panel_password_api_error admin_id=%s status=%s",
            message.from_user.id,
            exc.response.status_code,
        )
        _clear_admin_panel_pending(message.from_user.id)
        await state.clear()
        await message.answer("❌ No se pudo validar la clave con la API.")
        return
    except Exception:
        logger.exception(
            "admin_panel_password_connection_error admin_id=%s",
            message.from_user.id,
        )
        _clear_admin_panel_pending(message.from_user.id)
        await state.clear()
        await message.answer("❌ Error de conexión validando la clave del panel.")
        return

    token = str(result.get("token") or "").strip()
    if not token:
        logger.error(
            "admin_panel_password_missing_token admin_id=%s",
            message.from_user.id,
        )
        _clear_admin_panel_pending(message.from_user.id)
        await state.clear()
        await message.answer("❌ No se recibió token de acceso.")
        return

    data = await state.get_data()
    state_order_id = str(data.get("admin_panel_order_id") or "").strip()
    prompt_chat_id = data.get("admin_panel_prompt_chat_id")
    prompt_message_id = data.get("admin_panel_prompt_message_id")
    pending = _get_admin_panel_pending(message.from_user.id) or {}
    pending_order_id = str(pending.get("order_id") or "").strip()
    order_id = state_order_id or pending_order_id or None
    access_url = _build_admin_panel_access_url(token, order_id)
    logger.info(
        "admin_panel_password_valid admin_id=%s order_id=%s",
        message.from_user.id,
        order_id or "",
    )
    if prompt_chat_id and prompt_message_id:
        try:
            await message.bot.delete_message(
                chat_id=int(prompt_chat_id),
                message_id=int(prompt_message_id),
            )
        except Exception:
            pass
    _clear_admin_panel_pending(message.from_user.id)
    await state.clear()
    if _is_local_url(access_url):
        # Telegram no acepta localhost en botones inline URL.
        safe_url = html_escape(access_url, quote=True)
        sent_message = await message.answer(
            f"{t(locale, 'admin_panel_access_ready')}\n\n"
            "⚠️ Telegram no permite botón con URL local.\n"
            "Copia este enlace y ábrelo en tu navegador local:\n"
            f"<code>{safe_url}</code>",
            parse_mode="HTML",
        )
        _schedule_message_delete(
            message.bot,
            sent_message.chat.id,
            sent_message.message_id,
        )
        return

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=t(locale, "admin_panel_access_button"),
                    url=access_url,
                )
            ]
        ]
    )
    try:
        sent_message = await message.answer(
            t(locale, "admin_panel_access_ready"),
            parse_mode="HTML",
            reply_markup=keyboard,
        )
        _schedule_message_delete(
            message.bot,
            sent_message.chat.id,
            sent_message.message_id,
        )
    except TelegramBadRequest:
        safe_url = html_escape(access_url, quote=True)
        sent_message = await message.answer(
            f"{t(locale, 'admin_panel_access_ready')}\n\n"
            "⚠️ Telegram rechazó el botón URL.\n"
            "Copia y abre este enlace manualmente:\n"
            f"<code>{safe_url}</code>",
            parse_mode="HTML",
        )
        _schedule_message_delete(
            message.bot,
            sent_message.chat.id,
            sent_message.message_id,
        )


@router.message(AdminPanelAccessStates.awaiting_password)
async def handle_admin_panel_password(message: Message, state: FSMContext) -> None:
    await _process_admin_panel_password(message, state, message.text or "")


@router.message(F.text, _should_handle_admin_panel_password_fallback)
async def handle_admin_panel_password_fallback(
    message: Message, state: FSMContext
) -> None:
    await _process_admin_panel_password(message, state, message.text or "")


@router.callback_query(F.data.startswith("admin_ban:"))
async def handle_admin_ban(callback: CallbackQuery) -> None:
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
    if callback.from_user.id not in ADMIN_TELEGRAM_IDS:
        await callback.answer(t(locale, "admin_not_authorized"), show_alert=True)
        return
    if not BOT_TO_API_SECRET:
        await callback.answer(t(locale, "admin_missing_secret"), show_alert=True)
        return

    parts = callback.data.split(":")
    if len(parts) < 2:
        await callback.answer(t(locale, "admin_invalid_request"), show_alert=True)
        return

    try:
        telegram_id = int(parts[1])
    except ValueError:
        await callback.answer(t(locale, "admin_invalid_request"), show_alert=True)
        return

    try:
        response = await api_client.ban_user(
            telegram_id,
            {
                "reason": "Banned via Telegram admin",
                "admin_telegram_id": callback.from_user.id,
            },
            BOT_TO_API_SECRET,
        )
        if isinstance(response, dict) and response.get("status_code"):
            await callback.answer(t(locale, "admin_ban_failed"), show_alert=True)
            return

        try:
            await callback.message.edit_reply_markup(reply_markup=None)
        except Exception:
            pass
        await callback.answer(t(locale, "admin_ban_success"))
    except Exception:
        await callback.answer(t(locale, "admin_ban_failed"), show_alert=True)
