import logging
from typing import Any

from aiogram import Router
from aiogram.types import ChatMemberUpdated

from ..config import API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET
from ..services.api_client import ApiClient

router = Router()
api_client = ApiClient(API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET)


def _enum_value(value: Any) -> str:
    raw = getattr(value, "value", value)
    return str(raw or "").strip().lower()


def _normalize_chat_type(value: Any) -> str:
    chat_type = _enum_value(value)
    if chat_type in {"group", "supergroup", "channel"}:
        return chat_type
    return ""


def _is_admin_status(value: Any) -> bool:
    return _enum_value(value) in {"administrator", "creator"}


def _is_active_status(value: Any) -> bool:
    return _enum_value(value) not in {"left", "kicked"}


async def _register_chat_target(
    chat_id: int,
    chat_type: str,
    *,
    title: str | None = None,
    username: str | None = None,
    is_active: bool = True,
    bot_is_admin: bool = False,
) -> None:
    if not chat_type:
        return
    try:
        await api_client.bot_register_publish_target(
            {
                "chat_id": chat_id,
                "chat_type": chat_type,
                "chat_title": title or None,
                "chat_username": username or None,
                "is_active": is_active,
                "bot_is_admin": bot_is_admin,
            }
        )
    except Exception:
        logging.exception("publish_target_register_failed")


@router.my_chat_member()
async def on_my_chat_member(update: ChatMemberUpdated) -> None:
    chat = update.chat
    chat_type = _normalize_chat_type(getattr(chat, "type", None))
    if not chat_type:
        return
    await _register_chat_target(
        chat.id,
        chat_type,
        title=getattr(chat, "title", None),
        username=getattr(chat, "username", None),
        is_active=_is_active_status(update.new_chat_member.status),
        bot_is_admin=_is_admin_status(update.new_chat_member.status),
    )
