from typing import Dict, Optional

from aiogram.exceptions import TelegramBadRequest
from aiogram.enums import ParseMode
from aiogram.types import InlineKeyboardMarkup, Message

_MAIN_MESSAGE_BY_USER: Dict[int, int] = {}
_LAST_VIEW_BY_USER: Dict[int, Dict[str, object]] = {}
_VIEW_HISTORY_BY_USER: Dict[int, list[Dict[str, object]]] = {}
_MAX_HISTORY = 20


def set_main_message_id(user_id: int, message_id: int) -> None:
    _MAIN_MESSAGE_BY_USER[user_id] = message_id


def _record_view_state(
    user_id: int,
    text: str,
    reply_markup: Optional[InlineKeyboardMarkup],
    parse_mode: Optional[ParseMode | str],
    *,
    push_history: bool = True,
) -> None:
    previous = _LAST_VIEW_BY_USER.get(user_id)
    if push_history and previous:
        history = _VIEW_HISTORY_BY_USER.setdefault(user_id, [])
        history.append(previous)
        if len(history) > _MAX_HISTORY:
            history.pop(0)
    _LAST_VIEW_BY_USER[user_id] = {
        "text": text,
        "reply_markup": reply_markup,
        "parse_mode": parse_mode,
    }


def pop_previous_view(user_id: int) -> Optional[Dict[str, object]]:
    history = _VIEW_HISTORY_BY_USER.get(user_id)
    if not history:
        return None
    previous = history.pop()
    _LAST_VIEW_BY_USER[user_id] = previous
    return previous


async def try_edit_main_view(
    bot,
    user_id: int,
    chat_id: int,
    text: str,
    reply_markup: Optional[InlineKeyboardMarkup] = None,
    parse_mode: Optional[ParseMode | str] = None,
    *,
    push_history: bool = True,
) -> bool:
    message_id = _MAIN_MESSAGE_BY_USER.get(user_id)
    if not message_id:
        return False
    try:
        await bot.edit_message_text(
            chat_id=chat_id,
            message_id=message_id,
            text=text,
            reply_markup=reply_markup,
            parse_mode=parse_mode,
        )
        _record_view_state(
            user_id, text, reply_markup, parse_mode, push_history=push_history
        )
        return True
    except TelegramBadRequest as exc:
        error_text = str(exc).lower()
        if "message is not modified" in error_text:
            return True
        if "message to edit not found" not in error_text and "message can't be edited" not in error_text:
            try:
                await bot.edit_message_caption(
                    chat_id=chat_id,
                    message_id=message_id,
                    caption=text,
                    reply_markup=reply_markup,
                    parse_mode=parse_mode,
                )
                _record_view_state(
                    user_id, text, reply_markup, parse_mode, push_history=push_history
                )
                return True
            except TelegramBadRequest as caption_exc:
                caption_error = str(caption_exc).lower()
                if "message is not modified" in caption_error:
                    return True
        return False


async def render_main_view(
    message: Message,
    user_id: int,
    text: str,
    reply_markup: Optional[InlineKeyboardMarkup] = None,
    parse_mode: Optional[ParseMode | str] = None,
    *,
    push_history: bool = True,
) -> Message:
    chat_id = message.chat.id
    message_id = _MAIN_MESSAGE_BY_USER.get(user_id)

    def _should_fallback_to_new_message(error_text: str) -> bool:
        return "caption is too long" in error_text or "message is too long" in error_text

    if message_id:
        try:
            await message.bot.edit_message_text(
                chat_id=chat_id,
                message_id=message_id,
                text=text,
                reply_markup=reply_markup,
                parse_mode=parse_mode,
            )
            _record_view_state(
                user_id, text, reply_markup, parse_mode, push_history=push_history
            )
            return message
        except TelegramBadRequest as exc:
            error_text = str(exc).lower()
            if "message is not modified" in error_text:
                return message
            if "message to edit not found" not in error_text and "message can't be edited" not in error_text:
                try:
                    await message.bot.edit_message_caption(
                        chat_id=chat_id,
                        message_id=message_id,
                        caption=text,
                        reply_markup=reply_markup,
                        parse_mode=parse_mode,
                    )
                    _record_view_state(
                        user_id,
                        text,
                        reply_markup,
                        parse_mode,
                        push_history=push_history,
                    )
                    return message
                except TelegramBadRequest as caption_exc:
                    caption_error = str(caption_exc).lower()
                    if "message is not modified" in caption_error:
                        return message
                    if (
                        "message to edit not found" not in caption_error
                        and "message can't be edited" not in caption_error
                        and not _should_fallback_to_new_message(caption_error)
                    ):
                        return message

    sent = await message.answer(text, reply_markup=reply_markup, parse_mode=parse_mode)
    if sent:
        _MAIN_MESSAGE_BY_USER[user_id] = sent.message_id
        _record_view_state(
            user_id, text, reply_markup, parse_mode, push_history=push_history
        )
    return sent
