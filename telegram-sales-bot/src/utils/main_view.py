import logging
from typing import Dict, Optional

from aiogram.exceptions import TelegramBadRequest
from aiogram.enums import ParseMode
from aiogram.types import InlineKeyboardMarkup, InputMediaPhoto, Message

logger = logging.getLogger(__name__)

_MAIN_MESSAGE_BY_USER: Dict[int, int] = {}
_LAST_VIEW_BY_USER: Dict[int, Dict[str, object]] = {}
_VIEW_HISTORY_BY_USER: Dict[int, list[Dict[str, object]]] = {}
_MAX_HISTORY = 20


def _get_keyboard_stats(reply_markup: Optional[InlineKeyboardMarkup]) -> tuple[int, int]:
    if not reply_markup:
        return 0, 0
    inline_keyboard = getattr(reply_markup, "inline_keyboard", None) or []
    buttons = 0
    max_callback_len = 0
    for row in inline_keyboard:
        for button in row:
            buttons += 1
            callback_data = getattr(button, "callback_data", None)
            if callback_data:
                callback_len = len(str(callback_data))
                if callback_len > max_callback_len:
                    max_callback_len = callback_len
    return buttons, max_callback_len


def _log_telegram_error(
    action: str,
    error: Exception,
    *,
    user_id: int,
    chat_id: int,
    message_id: Optional[int],
    text: str,
    reply_markup: Optional[InlineKeyboardMarkup],
    photo: Optional[str] = None,
) -> None:
    buttons, max_callback_len = _get_keyboard_stats(reply_markup)
    logger.warning(
        "telegram_ui_error action=%s user_id=%s chat_id=%s message_id=%s text_len=%s photo=%s buttons=%s max_callback_len=%s error=%s",
        action,
        user_id,
        chat_id,
        message_id,
        len(text or ""),
        bool(photo),
        buttons,
        max_callback_len,
        str(error),
    )


async def _drop_main_message(
    bot,
    *,
    user_id: int,
    chat_id: int,
    message_id: Optional[int],
    text: str,
    reply_markup: Optional[InlineKeyboardMarkup],
    photo: Optional[str] = None,
    action: str = "drop_main_message.delete",
) -> None:
    if not message_id:
        return
    try:
        await bot.delete_message(chat_id=chat_id, message_id=message_id)
    except TelegramBadRequest as exc:
        _log_telegram_error(
            action,
            exc,
            user_id=user_id,
            chat_id=chat_id,
            message_id=message_id,
            text=text,
            reply_markup=reply_markup,
            photo=photo,
        )
    finally:
        _MAIN_MESSAGE_BY_USER.pop(user_id, None)


def set_main_message_id(user_id: int, message_id: int) -> None:
    _MAIN_MESSAGE_BY_USER[user_id] = message_id


def _record_view_state(
    user_id: int,
    text: str,
    reply_markup: Optional[InlineKeyboardMarkup],
    parse_mode: Optional[ParseMode | str],
    photo: Optional[str] = None,
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
        "photo": photo,
    }


def pop_previous_view(user_id: int) -> Optional[Dict[str, object]]:
    history = _VIEW_HISTORY_BY_USER.get(user_id)
    if not history:
        return None
    previous = history.pop()
    _LAST_VIEW_BY_USER[user_id] = previous
    return previous


def get_main_message_id(user_id: int) -> Optional[int]:
    return _MAIN_MESSAGE_BY_USER.get(user_id)


def clear_main_message_id(user_id: int) -> None:
    _MAIN_MESSAGE_BY_USER.pop(user_id, None)


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
        _log_telegram_error(
            "try_edit_main_view.edit_text",
            exc,
            user_id=user_id,
            chat_id=chat_id,
            message_id=message_id,
            text=text,
            reply_markup=reply_markup,
        )
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
            _log_telegram_error(
                "render_main_view.edit_text",
                exc,
                user_id=user_id,
                chat_id=chat_id,
                message_id=message_id,
                text=text,
                reply_markup=reply_markup,
            )
            await _drop_main_message(
                message.bot,
                user_id=user_id,
                chat_id=chat_id,
                message_id=message_id,
                text=text,
                reply_markup=reply_markup,
                action="render_main_view.delete_after_edit_text_error",
            )

    try:
        sent = await message.answer(text, reply_markup=reply_markup, parse_mode=parse_mode)
    except TelegramBadRequest as answer_exc:
        _log_telegram_error(
            "render_main_view.answer",
            answer_exc,
            user_id=user_id,
            chat_id=chat_id,
            message_id=message.message_id if message else None,
            text=text,
            reply_markup=reply_markup,
        )
        raise
    if sent:
        _MAIN_MESSAGE_BY_USER[user_id] = sent.message_id
        _record_view_state(
            user_id, text, reply_markup, parse_mode, push_history=push_history
        )
    return sent


async def render_main_view_with_photo(
    message: Message,
    user_id: int,
    text: str,
    photo: str,
    reply_markup: Optional[InlineKeyboardMarkup] = None,
    parse_mode: Optional[ParseMode | str] = None,
    *,
    push_history: bool = True,
) -> Message:
    chat_id = message.chat.id
    message_id = _MAIN_MESSAGE_BY_USER.get(user_id)
    media = InputMediaPhoto(media=photo, caption=text, parse_mode=parse_mode)

    if message_id:
        try:
            await message.bot.edit_message_media(
                chat_id=chat_id,
                message_id=message_id,
                media=media,
                reply_markup=reply_markup,
            )
            _record_view_state(
                user_id,
                text,
                reply_markup,
                parse_mode,
                photo,
                push_history=push_history,
            )
            return message
        except TelegramBadRequest as exc:
            error_text = str(exc).lower()
            if "message is not modified" in error_text:
                return message
            _log_telegram_error(
                "render_main_view_with_photo.edit_media",
                exc,
                user_id=user_id,
                chat_id=chat_id,
                message_id=message_id,
                text=text,
                reply_markup=reply_markup,
                photo=photo,
            )
            await _drop_main_message(
                message.bot,
                user_id=user_id,
                chat_id=chat_id,
                message_id=message_id,
                text=text,
                reply_markup=reply_markup,
                photo=photo,
                action="render_main_view_with_photo.delete_after_edit_media_error",
            )

    try:
        sent = await message.answer_photo(
            photo=photo,
            caption=text,
            reply_markup=reply_markup,
            parse_mode=parse_mode,
        )
        if sent:
            _MAIN_MESSAGE_BY_USER[user_id] = sent.message_id
            _record_view_state(
                user_id,
                text,
                reply_markup,
                parse_mode,
                photo,
                push_history=push_history,
            )
        return sent
    except TelegramBadRequest as photo_exc:
        _log_telegram_error(
            "render_main_view_with_photo.answer_photo",
            photo_exc,
            user_id=user_id,
            chat_id=chat_id,
            message_id=message.message_id if message else None,
            text=text,
            reply_markup=reply_markup,
            photo=photo,
        )
        sent = await message.answer(
            text,
            reply_markup=reply_markup,
            parse_mode=parse_mode,
        )
        if sent:
            _MAIN_MESSAGE_BY_USER[user_id] = sent.message_id
            _record_view_state(
                user_id,
                text,
                reply_markup,
                parse_mode,
                push_history=push_history,
            )
        return sent
