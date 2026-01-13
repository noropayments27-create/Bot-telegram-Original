import asyncio
from typing import Any, Dict, Optional
from uuid import uuid4

from aiogram.types import Message

from ..services.i18n import t
from ..handlers.menu import build_home_text, build_main_keyboard
from ..utils.main_view import render_main_view, set_main_message_id


def is_order_payable(order: Optional[Dict[str, Any]]) -> bool:
    if not order:
        return False
    return order.get("status") == "WAITING_PAYMENT"


async def show_not_payable_and_redirect(
    message: Message,
    state,
    locale: str | None = None,
    *,
    delay_seconds: int = 5,
) -> None:
    notice_text = t(locale, "order_expired_notice")
    token = str(uuid4())
    user_id = message.from_user.id
    set_main_message_id(user_id, message.message_id)
    await state.update_data(order_guard_token=token, order_id=None, current_order_id=None)
    await state.set_state(None)

    try:
        await render_main_view(
            message,
            user_id,
            notice_text,
            reply_markup=None,
            parse_mode="HTML",
        )
    except Exception as exc:
        print("[bot/order_guard] notice_edit_failed", {"error": str(exc)})
        return
        await asyncio.sleep(delay_seconds)
        data = await state.get_data()
        if data.get("order_guard_token") != current_token:
            return
        try:
            await render_main_view(
                message,
                user_id,
                build_home_text(locale),
                reply_markup=build_main_keyboard(locale),
                parse_mode="HTML",
            )
        except Exception as exc:
            print("[bot/order_guard] home_edit_failed", {"error": str(exc)})

    asyncio.create_task(_return_home(token))


async def guard_order_payable_or_redirect(
    api_client,
    order_id: str,
    message: Message,
    state,
    locale: str | None = None,
) -> bool:
    try:
        result = await api_client.get_order(order_id)
    except Exception:
        print("[bot/order_guard] not_payable", {"order_id": order_id, "status": "NOT_FOUND"})
        await show_not_payable_and_redirect(message, state, locale)
        return False

    order = result.get("order") if isinstance(result, dict) else None
    if not is_order_payable(order):
        print(
            "[bot/order_guard] not_payable",
            {"order_id": order_id, "status": order.get("status") if order else None},
        )
        await show_not_payable_and_redirect(message, state, locale)
        return False

    return True
