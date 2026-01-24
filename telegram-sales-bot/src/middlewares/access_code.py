from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable, Dict

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message

from ..config import (
    ADMIN_TELEGRAM_IDS,
    API_BASE_URL,
    API_TOKEN,
    BOT_TO_API_SECRET,
)
from ..services.api_client import ApiClient
from ..services.i18n import t
from ..states.access import AccessStates


class AccessCodeMiddleware(BaseMiddleware):
    def __init__(self) -> None:
        super().__init__()
        self._api_client = ApiClient(API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET)
        self._logger = logging.getLogger(__name__)

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

        state = data.get("state")
        if state:
            current_state = await state.get_state()
            if current_state == AccessStates.awaiting_code.state:
                return await handler(event, data)

        if isinstance(event, Message):
            if event.text and event.text.strip().startswith("/start"):
                return await handler(event, data)

        try:
            result = await self._api_client.get_user(user.id)
            referred = (result.get("user") or {}).get("referred_by_affiliate_id")
            if referred:
                return await handler(event, data)
        except Exception:
            return await handler(event, data)

        if state:
            await state.set_state(AccessStates.awaiting_code)

        locale = (user.language_code or "es").lower()
        prompt = t(locale, "access_code_prompt")
        self._logger.info("access_code_blocked user=%s", user.id)

        if isinstance(event, CallbackQuery):
            if event.message:
                await event.message.answer(prompt)
            await event.answer(t(locale, "access_code_required"), show_alert=True)
            return None
        if isinstance(event, Message):
            await event.answer(prompt)
            return None

        return await handler(event, data)
