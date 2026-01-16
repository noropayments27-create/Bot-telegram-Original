from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from ..config import (
    API_BASE_URL,
    API_TOKEN,
    BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    BOT_RATE_LIMIT_ENABLED,
    BOT_RATE_LIMIT_SECONDS,
    BOT_TO_API_SECRET,
)
from ..services.api_client import ApiClient
from ..services.i18n import t
from ..services.user_locale import get_user_locale
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from .menu import build_home_text, build_main_keyboard, build_community_text
from .menu import build_language_keyboard
from ..utils.main_view import render_main_view, set_main_message_id
from ..utils.order_watch import stop_order_watch
from ..utils.rate_limit import check_global_rate_limit

router = Router()
api_client = ApiClient(API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET)


@router.message(Command("start"))
async def handle_start(message: Message) -> None:
    if not message.from_user:
        return
    locale = await get_user_locale(
        api_client, message.from_user.id, message.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        message.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await message.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds)
        )
        return
    await stop_order_watch(message.from_user.id, "start")
    start_payload = None

    if message.text:
        parts = message.text.split(maxsplit=1)
        if len(parts) > 1:
            start_payload = parts[1].strip() or None

    try:
        photo_file_id = None
        try:
            photos = await message.bot.get_user_profile_photos(
                message.from_user.id, limit=1
            )
            if photos.total_count > 0 and photos.photos:
                photo_file_id = photos.photos[0][-1].file_id
        except Exception:
            photo_file_id = None
        payload = {
            "telegram_id": message.from_user.id,
            "username": message.from_user.username,
            "first_name": message.from_user.first_name,
            "last_name": message.from_user.last_name,
            "language_code": message.from_user.language_code,
            "telegram_photo_file_id": photo_file_id,
            "locale": "es"
            if not message.from_user.language_code
            or (message.from_user.language_code or "").lower().startswith("es")
            else "en",
            "start_payload": start_payload,
            "start_affiliate_code": start_payload,
        }
        result = await api_client.upsert_telegram_user(payload)
        if result["status_code"] == 403:
            sent = await message.answer(
                t(locale, "access_restricted")
            )
            if sent:
                set_main_message_id(message.from_user.id, sent.message_id)
            return
    except Exception:
        pass

    locale = await get_user_locale(
        api_client, message.from_user.id, message.from_user.language_code
    )
    photo_url = "https://i.ibb.co/356LrnLr/bot.png"
    sent = await message.answer_photo(
        photo=photo_url,
        caption=build_home_text(locale),
        reply_markup=build_main_keyboard(locale),
        parse_mode="HTML",
    )
    if sent:
        set_main_message_id(message.from_user.id, sent.message_id)


@router.callback_query(F.data == "home:show")
async def handle_home_show(callback: CallbackQuery) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
        )
        return
    await stop_order_watch(callback.from_user.id, "home")
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    await render_main_view(
        callback.message,
        callback.from_user.id,
        build_home_text(locale),
        reply_markup=build_main_keyboard(locale),
        parse_mode="HTML",
    )
    await callback.answer()


@router.callback_query(F.data == "home:soon:idioma")
async def handle_language_panel(callback: CallbackQuery) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    current = (
        t(locale, "language_name_es")
        if str(locale).lower() == "es"
        else t(locale, "language_name_en")
    )
    text = (
        f"{t(locale, 'language_panel_title')}\n\n"
        f"{t(locale, 'language_panel_current').format(language=current)}\n\n"
        f"{t(locale, 'language_panel_choose')}"
    )
    await render_main_view(
        callback.message,
        callback.from_user.id,
        text,
        reply_markup=build_language_keyboard(locale),
        parse_mode="HTML",
    )
    await callback.answer()


@router.callback_query(F.data.startswith("home:soon:"))
async def handle_home_soon(callback: CallbackQuery) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    await render_main_view(
        callback.message,
        callback.from_user.id,
        f"{t(locale, 'home_soon_title')}\n\n{t(locale, 'home_soon_body')}",
        reply_markup=build_main_keyboard(locale),
    )
    await callback.answer()


@router.callback_query(F.data == "home:community")
async def handle_home_community(callback: CallbackQuery) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
        )
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_back"), callback_data="home:show"
                ),
                InlineKeyboardButton(
                    text=t(locale, "btn_home"), callback_data="home:show"
                ),
            ]
        ]
    )
    await render_main_view(
        callback.message,
        callback.from_user.id,
        build_community_text(locale),
        reply_markup=keyboard,
        parse_mode="HTML",
    )
    await callback.answer()
