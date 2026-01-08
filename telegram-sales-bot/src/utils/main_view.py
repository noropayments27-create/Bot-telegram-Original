from typing import Dict, Optional

from aiogram.exceptions import TelegramBadRequest
from aiogram.enums import ParseMode
from aiogram.types import InlineKeyboardMarkup, Message

_MAIN_MESSAGE_BY_USER: Dict[int, int] = {}


def set_main_message_id(user_id: int, message_id: int) -> None:
    _MAIN_MESSAGE_BY_USER[user_id] = message_id


async def render_main_view(
    message: Message,
    user_id: int,
    text: str,
    reply_markup: Optional[InlineKeyboardMarkup] = None,
    parse_mode: Optional[ParseMode | str] = None,
) -> Message:
    chat_id = message.chat.id
    message_id = _MAIN_MESSAGE_BY_USER.get(user_id)

    if message_id:
        try:
            await message.bot.edit_message_text(
                chat_id=chat_id,
                message_id=message_id,
                text=text,
                reply_markup=reply_markup,
                parse_mode=parse_mode,
            )
            return message
        except TelegramBadRequest as exc:
            error_text = str(exc).lower()
            if "message is not modified" in error_text:
                return message
            if "message to edit not found" not in error_text and "message can't be edited" not in error_text:
                return message

    sent = await message.answer(text, reply_markup=reply_markup, parse_mode=parse_mode)
    if sent:
        _MAIN_MESSAGE_BY_USER[user_id] = sent.message_id
    return sent
