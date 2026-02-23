from __future__ import annotations

from typing import Any, Awaitable, Callable, Dict

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message

from ..utils.perf import finish_event, is_perf_enabled, start_event


class PerfLogMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[Any, Dict[str, Any]], Awaitable[Any]],
        event: Any,
        data: Dict[str, Any],
    ) -> Any:
        if not is_perf_enabled():
            return await handler(event, data)

        user = getattr(event, "from_user", None)
        user_id = user.id if user else None
        update_type = "other"
        route = None
        if isinstance(event, CallbackQuery):
            update_type = "callback_query"
            route = str(event.data or "")[:64] or None
        elif isinstance(event, Message):
            update_type = "message"
            route = str(event.text or "")[:64] or None

        token = start_event(
            scope="update",
            user_id=user_id,
            update_type=update_type,
            route=route,
        )
        try:
            result = await handler(event, data)
            finish_event(token, status="ok")
            return result
        except Exception as exc:
            finish_event(token, status="error", error=exc.__class__.__name__)
            raise

