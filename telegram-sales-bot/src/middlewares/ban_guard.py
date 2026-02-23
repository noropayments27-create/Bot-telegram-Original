from __future__ import annotations

import time
from typing import Any, Awaitable, Callable, Dict, Optional

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message

from ..config import API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET
from ..services.api_client import ApiClient
from ..services.i18n import t


class BanGuardMiddleware(BaseMiddleware):
    def __init__(self, cache_ttl: float = 10.0) -> None:
        super().__init__()
        self._api_client = ApiClient(API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET)
        self._cache_ttl = max(float(cache_ttl), 0.0)
        self._cache: Dict[int, tuple[bool, float]] = {}

    def _cache_get(self, user_id: int) -> Optional[bool]:
        slot = self._cache.get(user_id)
        if not slot:
            return None
        banned, expires_at = slot
        if time.monotonic() >= expires_at:
            self._cache.pop(user_id, None)
            return None
        return banned

    def _cache_set(self, user_id: int, banned: bool) -> None:
        self._cache[user_id] = (bool(banned), time.monotonic() + self._cache_ttl)

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

        banned = self._cache_get(user.id)
        try:
            if banned is None:
                result = await self._api_client.get_ban_status(user.id)
                banned = bool(result.get("banned"))
                self._cache_set(user.id, banned)
        except Exception:
            # If ban check fails, allow the handler to proceed.
            return await handler(event, data)

        if banned:
            message_text = t(locale, "banned_message")
            if isinstance(event, CallbackQuery):
                if event.message:
                    await event.message.answer(message_text)
                await event.answer()
            elif isinstance(event, Message):
                await event.answer(message_text)
            return None

        return await handler(event, data)
