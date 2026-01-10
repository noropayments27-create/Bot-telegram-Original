from aiogram import F, Router
from aiogram.types import CallbackQuery

from ..config import (
    API_BASE_URL,
    API_TOKEN,
    ADMIN_TELEGRAM_IDS,
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
api_client = ApiClient(API_BASE_URL, API_TOKEN)


@router.callback_query(F.data.startswith("admin_auth:"))
async def handle_admin_auth_decision(callback: CallbackQuery) -> None:
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
    if len(parts) < 3:
        await callback.answer(t(locale, "admin_invalid_request"), show_alert=True)
        return

    request_id = parts[1]
    decision = parts[2].upper()
    if decision not in {"APPROVE", "DENY"}:
        await callback.answer(t(locale, "admin_invalid_decision"), show_alert=True)
        return

    try:
        await api_client.send_admin_auth_decision(
            {"request_id": request_id, "decision": decision}, BOT_TO_API_SECRET
        )
        try:
            await callback.message.edit_reply_markup(reply_markup=None)
        except Exception:
            pass
        await callback.answer(t(locale, "admin_confirm_sent"))
    except Exception:
        await callback.answer(
            t(locale, "admin_decision_failed"), show_alert=True
        )
