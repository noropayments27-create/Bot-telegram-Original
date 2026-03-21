import logging
import mimetypes
from urllib.parse import urlparse
from typing import Dict, Optional

import httpx
from aiogram.exceptions import TelegramBadRequest
from aiogram.enums import ParseMode
from aiogram.types import BufferedInputFile, InlineKeyboardMarkup, InputMediaPhoto, Message

logger = logging.getLogger(__name__)

_MAIN_MESSAGE_BY_USER: Dict[int, int] = {}
_LAST_VIEW_BY_USER: Dict[int, Dict[str, object]] = {}
_VIEW_HISTORY_BY_USER: Dict[int, list[Dict[str, object]]] = {}
_MAX_HISTORY = 20
_PHOTO_FETCH_TIMEOUT_SECONDS = 12.0
_PHOTO_FETCH_MAX_BYTES = 10 * 1024 * 1024


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


def _is_http_photo_source(photo: str) -> bool:
    value = str(photo or "").strip()
    if not value:
        return False
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _guess_photo_filename(photo_url: str, content_type: str) -> str:
    parsed = urlparse(photo_url)
    name = (parsed.path or "").rsplit("/", 1)[-1].strip()
    if name and "." in name and len(name) <= 120:
        return name
    guessed_ext = mimetypes.guess_extension(content_type.split(";", 1)[0].strip()) or ".jpg"
    safe_ext = guessed_ext if guessed_ext.startswith(".") else ".jpg"
    return f"photo{safe_ext}"


async def _prepare_photo_for_telegram(photo: str):
    source = str(photo or "").strip()
    if not _is_http_photo_source(source):
        return source
    try:
        async with httpx.AsyncClient(
            timeout=_PHOTO_FETCH_TIMEOUT_SECONDS,
            follow_redirects=True,
            headers={"User-Agent": "telegram-sales-bot/photo-fetch"},
        ) as client:
            response = await client.get(source)
            response.raise_for_status()
            content_type = str(response.headers.get("content-type") or "").strip().lower()
            if not content_type.startswith("image/"):
                logger.warning(
                    "photo_fetch_invalid_content_type source=%s content_type=%s",
                    source,
                    content_type or "-",
                )
                return None
            body = response.content or b""
            if not body:
                logger.warning("photo_fetch_empty_body source=%s", source)
                return None
            if len(body) > _PHOTO_FETCH_MAX_BYTES:
                logger.warning(
                    "photo_fetch_too_large source=%s bytes=%s max_bytes=%s",
                    source,
                    len(body),
                    _PHOTO_FETCH_MAX_BYTES,
                )
                return None
            filename = _guess_photo_filename(str(response.url), content_type)
            return BufferedInputFile(body, filename=filename)
    except Exception as exc:
        logger.warning("photo_fetch_failed source=%s error=%s", source, str(exc))
        return None


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
    photo_sample = str(photo or "").strip()
    if len(photo_sample) > 180:
        photo_sample = f"{photo_sample[:177]}..."
    logger.warning(
        "telegram_ui_error action=%s user_id=%s chat_id=%s message_id=%s text_len=%s photo=%s photo_sample=%s buttons=%s max_callback_len=%s error=%s",
        action,
        user_id,
        chat_id,
        message_id,
        len(text or ""),
        bool(photo),
        photo_sample or "-",
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
    prepared_photo = await _prepare_photo_for_telegram(photo)
    if prepared_photo is None:
        return await render_main_view(
            message,
            user_id,
            text,
            reply_markup=reply_markup,
            parse_mode=parse_mode,
            push_history=push_history,
        )
    media = InputMediaPhoto(media=prepared_photo, caption=text, parse_mode=parse_mode)

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
        prepared_photo = await _prepare_photo_for_telegram(photo)
        if prepared_photo is None:
            return await render_main_view(
                message,
                user_id,
                text,
                reply_markup=reply_markup,
                parse_mode=parse_mode,
                push_history=push_history,
            )
        sent = await message.answer_photo(
            photo=prepared_photo,
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
