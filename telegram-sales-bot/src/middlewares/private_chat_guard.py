from __future__ import annotations

from typing import Any, Awaitable, Callable, Dict

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message

from ..config import API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET
from ..services.api_client import ApiClient

PRIVATE_PURCHASE_LINK = "https://t.me/noropayments_shop_bot?start=7621162350"
PRIVATE_ONLY_MESSAGE = f"Compra solo por privado: {PRIVATE_PURCHASE_LINK}"
api_client = ApiClient(API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET)


def _resolve_chat_type(event: Any) -> str | None:
    if isinstance(event, Message):
        chat_type = getattr(event.chat, "type", None)
        return getattr(chat_type, "value", chat_type)
    if isinstance(event, CallbackQuery) and event.message:
        chat_type = getattr(event.message.chat, "type", None)
        return getattr(chat_type, "value", chat_type)
    chat = getattr(event, "chat", None)
    if chat is not None:
        chat_type = getattr(chat, "type", None)
        return getattr(chat_type, "value", chat_type) or ""
    return None


async def _register_publish_target_from_event(event: Any, data: Dict[str, Any]) -> None:
    chat = None
    if isinstance(event, Message):
        chat = event.chat
    elif isinstance(event, CallbackQuery) and event.message:
        chat = event.message.chat
    if chat is None:
        return
    chat_type = getattr(getattr(chat, "type", None), "value", getattr(chat, "type", None))
    chat_type = str(chat_type or "").strip().lower()
    if chat_type not in {"group", "supergroup", "channel"}:
        return
    bot = data.get("bot") or data.get("event_bot")
    bot_is_admin = False
    if bot is not None:
        me = None
        try:
            me = await bot.get_me()
            member = await bot.get_chat_member(chat.id, me.id)
            status = str(getattr(getattr(member, "status", None), "value", getattr(member, "status", None)) or "").lower()
            bot_is_admin = status in {"administrator", "creator"}
        except Exception:
            bot_is_admin = False
        if not bot_is_admin and me is not None:
            try:
                admins = await bot.get_chat_administrators(chat.id)
                for admin in admins or []:
                    user = getattr(admin, "user", None)
                    if user is not None and int(getattr(user, "id", 0) or 0) == int(me.id):
                        status = str(getattr(getattr(admin, "status", None), "value", getattr(admin, "status", None)) or "").lower()
                        bot_is_admin = status in {"administrator", "creator"}
                        if bot_is_admin:
                            break
            except Exception:
                pass
    try:
        await api_client.bot_register_publish_target(
            {
                "chat_id": chat.id,
                "chat_type": chat_type,
                "chat_title": getattr(chat, "title", None),
                "chat_username": getattr(chat, "username", None),
                "is_active": True,
                "bot_is_admin": bot_is_admin,
            }
        )
    except Exception:
        pass


class PrivateChatGuardMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[Any, Dict[str, Any]], Awaitable[Any]],
        event: Any,
        data: Dict[str, Any],
    ) -> Any:
        chat_type = _resolve_chat_type(event)
        if str(chat_type or "").strip().lower() == "private":
            return await handler(event, data)

        await _register_publish_target_from_event(event, data)

        if isinstance(event, Message):
            text = str(event.text or "").strip()
            if text.startswith("/start"):
                await event.answer(PRIVATE_ONLY_MESSAGE)
            return None

        if isinstance(event, CallbackQuery):
            await event.answer(PRIVATE_ONLY_MESSAGE, show_alert=True)
            return None

        return None
