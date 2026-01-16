from __future__ import annotations

from typing import Any, Awaitable, Callable, Dict, Optional

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message

from ..config import API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET
from ..services.api_client import ApiClient
from ..services.i18n import t


class BanGuardMiddleware(BaseMiddleware):
    def __init__(self) -> None:
        super().__init__()
        self._api_client = ApiClient(API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET)

    async def __call__(
        self,
        handler: Callable[[Any, Dict[str, Any]], Awaitable[Any]],
        event: Any,
        data: Dict[str, Any],
    ) -> Any:
        user = getattr(event, "from_user", None)
        if not user:
            return await handler(event, data)

        locale = (user.language_code or "es").lower()

        try:
            result = await self._api_client.get_ban_status(user.id)
            if result.get("banned"):
                message_text = t(locale, "banned_message")
                if isinstance(event, CallbackQuery):
                    if event.message:
                        await event.message.answer(message_text)
                    await event.answer()
                elif isinstance(event, Message):
                    await event.answer(message_text)
                return None
        except Exception:
            # If ban check fails, allow the handler to proceed.
            return await handler(event, data)

        return await handler(event, data)
