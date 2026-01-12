import asyncio
from typing import Dict

from aiogram.types import Message

from .order_flow import is_order_payable, show_not_payable_and_redirect

_WATCH_TASKS: Dict[int, asyncio.Task] = {}
_WATCH_ORDER: Dict[int, str] = {}


async def stop_order_watch(user_id: int, reason: str) -> None:
    task = _WATCH_TASKS.pop(user_id, None)
    existing = _WATCH_ORDER.pop(user_id, None)
    if task and not task.done():
        task.cancel()
    if task or existing:
        print("[bot/order_watch] stopped", {"telegram_id": user_id, "reason": reason})


async def start_order_watch(
    api_client,
    order_id: str,
    message: Message,
    state,
    locale: str | None = None,
    *,
    interval_seconds: int = 3,
) -> None:
    user_id = message.from_user.id
    current = _WATCH_ORDER.get(user_id)
    if current == order_id and user_id in _WATCH_TASKS:
        return
    if current and current != order_id:
        print("[bot/order_watch] cancelled previous", {"telegram_id": user_id})
        await stop_order_watch(user_id, "order_changed")

    async def _watch() -> None:
        print("[bot/order_watch] started", {"telegram_id": user_id, "order_id": order_id})
        while True:
            await asyncio.sleep(interval_seconds)
            data = await state.get_data()
            if data.get("order_guard_token"):
                await stop_order_watch(user_id, "guard_active")
                return
            if data.get("current_order_id") not in (None, order_id):
                await stop_order_watch(user_id, "order_mismatch")
                return
            try:
                result = await api_client.get_order(order_id)
            except Exception:
                await stop_order_watch(user_id, "fetch_failed")
                return
            order = result.get("order") if isinstance(result, dict) else None
            if not is_order_payable(order):
                print(
                    "[bot/order_watch] not_payable detected",
                    {"order_id": order_id, "status": order.get("status") if order else None},
                )
                await show_not_payable_and_redirect(message, state, locale)
                await stop_order_watch(user_id, "not_payable")
                return

    task = asyncio.create_task(_watch())
    _WATCH_TASKS[user_id] = task
    _WATCH_ORDER[user_id] = order_id
