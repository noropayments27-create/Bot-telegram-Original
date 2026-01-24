import asyncio
from typing import Any, Dict, Optional
from uuid import uuid4

from aiogram.types import Message

from ..utils.main_view import try_edit_main_view
from ..utils.home_view import render_home_view

_ORDER_POLLERS: Dict[int, asyncio.Task] = {}
_ORDER_POLL_ORDER: Dict[int, str] = {}

_NOTICE_TEXT = (
    "⛔️ La orden actual ya no está disponible (expiró o fue cancelada) "
    "te redirijo al menú principal ⏳"
)


def is_order_payable(order: Optional[Dict[str, Any]]) -> bool:
    if not order:
        return False
    status = order.get("status")
    return status == "WAITING_PAYMENT"


async def _stop_order_polling(user_id: int, reason: str) -> None:
    task = _ORDER_POLLERS.pop(user_id, None)
    existing_order = _ORDER_POLL_ORDER.pop(user_id, None)
    if task and not task.done():
        task.cancel()
    if task or existing_order:
        print("[pay/poll] stopped", {"user_id": user_id, "reason": reason})


async def show_order_not_available_and_redirect(
    message: Message,
    state,
    locale: str | None = None,
    *,
    delay_seconds: int = 5,
) -> None:
    token = str(uuid4())
    user_id = message.from_user.id
    await _stop_order_polling(user_id, "redirect")
    await state.update_data(
        order_guard_token=token,
        order_id=None,
        current_order_id=None,
    )
    await state.set_state(None)

    edited = await try_edit_main_view(
        message.bot,
        user_id,
        message.chat.id,
        _NOTICE_TEXT,
        reply_markup=None,
    )
    if not edited:
        try:
            await message.edit_text(_NOTICE_TEXT)
            edited = True
        except Exception:
            try:
                await message.edit_caption(_NOTICE_TEXT)
                edited = True
            except Exception:
                edited = False
    if not edited:
        print("[bot/order_guard] edit_failed", {"user_id": user_id})

    async def _return_to_menu(current_token: str) -> None:
        await asyncio.sleep(delay_seconds)
        data = await state.get_data()
        if data.get("order_guard_token") != current_token:
            return
        try:
            await render_home_view(message, user_id, locale)
        except Exception:
            pass

    asyncio.create_task(_return_to_menu(token))


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
        print(
            "[bot/order_guard] not_payable",
            {"order_id": order_id, "status": "NOT_FOUND"},
        )
        await show_order_not_available_and_redirect(message, state, locale)
        return False

    order = result.get("order") if isinstance(result, dict) else None
    if not is_order_payable(order):
        print(
            "[bot/order_guard] not_payable",
            {"order_id": order_id, "status": order.get("status") if order else None},
        )
        await show_order_not_available_and_redirect(message, state, locale)
        return False

    return True


async def start_order_status_polling(
    api_client,
    order_id: str,
    message: Message,
    state,
    locale: str | None = None,
    *,
    interval_seconds: int = 3,
) -> None:
    user_id = message.from_user.id
    existing = _ORDER_POLL_ORDER.get(user_id)
    if existing == order_id and user_id in _ORDER_POLLERS:
        return
    if existing and existing != order_id:
        await _stop_order_polling(user_id, "order_changed")

    token = str(uuid4())
    await state.update_data(order_poll_token=token, order_poll_order_id=order_id)

    async def _poll() -> None:
        print("[pay/poll] started", {"user_id": user_id, "order_id": order_id})
        while True:
            await asyncio.sleep(interval_seconds)
            data = await state.get_data()
            if data.get("order_poll_token") != token:
                await _stop_order_polling(user_id, "token_mismatch")
                return
            if data.get("current_order_id") not in (None, order_id):
                await _stop_order_polling(user_id, "order_mismatch")
                return
            try:
                result = await api_client.get_order(order_id)
            except Exception:
                await _stop_order_polling(user_id, "fetch_failed")
                return
            order = result.get("order") if isinstance(result, dict) else None
            if not is_order_payable(order):
                print(
                    "[pay/poll] not_payable",
                    {
                        "user_id": user_id,
                        "order_id": order_id,
                        "status": order.get("status") if order else None,
                    },
                )
                await show_order_not_available_and_redirect(message, state, locale)
                await _stop_order_polling(user_id, "not_payable")
                return

    task = asyncio.create_task(_poll())
    _ORDER_POLLERS[user_id] = task
    _ORDER_POLL_ORDER[user_id] = order_id


async def stop_order_status_polling(user_id: int, reason: str) -> None:
    await _stop_order_polling(user_id, reason)
