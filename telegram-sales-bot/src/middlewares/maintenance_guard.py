from __future__ import annotations

import time
from typing import Any, Awaitable, Callable, Dict

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message

from ..config import ADMIN_TELEGRAM_IDS, API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET
from ..services.api_client import ApiClient
from ..services.i18n import t


class MaintenanceGuardMiddleware(BaseMiddleware):
    def __init__(self, cache_ttl: float = 5.0) -> None:
        super().__init__()
        self._api_client = ApiClient(API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET)
        self._cache_ttl = cache_ttl
        self._cached_active = False
        self._cache_expires_at = 0.0

    async def _get_status(self) -> bool:
        now = time.monotonic()
        if now < self._cache_expires_at:
            return self._cached_active
        try:
            result = await self._api_client.get_maintenance_status()
            active = bool(result.get("active"))
            self._cached_active = active
            self._cache_expires_at = now + self._cache_ttl
            return active
        except Exception:
            self._cache_expires_at = now + 1.0
            return False

    async def __call__(
        self,
        handler: Callable[[Any, Dict[str, Any]], Awaitable[Any]],
        event: Any,
        data: Dict[str, Any],
    ) -> Any:
        user = getattr(event, "from_user", None)
        if not user:
            return await handler(event, data)

        if user.id in ADMIN_TELEGRAM_IDS:
            return await handler(event, data)

        active = await self._get_status()
        if not active:
            return await handler(event, data)

        locale = (user.language_code or "es").lower()
        message_text = t(locale, "maintenance_message")

        if isinstance(event, CallbackQuery):
            if event.message:
                await event.message.answer(message_text)
            await event.answer()
            return None
        if isinstance(event, Message):
            await event.answer(message_text)
            return None

        return await handler(event, data)
