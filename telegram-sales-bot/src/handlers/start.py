from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message
import re
from aiogram.fsm.context import FSMContext
import logging

from ..config import (
    API_BASE_URL,
    API_TOKEN,
    BOT_COMMUNITY_IMAGE_URL,
    ADMIN_TELEGRAM_IDS,
    BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    BOT_RATE_LIMIT_ENABLED,
    BOT_RATE_LIMIT_SECONDS,
    BOT_TO_API_SECRET,
)
from ..services.api_client import ApiClient
from ..services.bot_assets import get_bot_asset_image
from ..services.i18n import t
from ..services.user_locale import get_user_locale
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from .menu import build_main_keyboard, build_community_text
from .menu import build_language_keyboard
from .support import start_support_flow
from ..utils.main_view import render_main_view, render_main_view_with_photo, set_main_message_id, pop_previous_view, clear_main_message_id
from ..utils.home_view import render_home_view
from ..utils.order_watch import stop_order_watch
from ..utils.rate_limit import check_global_rate_limit
from ..states.access import AccessStates

router = Router()
api_client = ApiClient(API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET)
logger = logging.getLogger(__name__)
 


async def _assign_access_code(
    message: Message,
    user_id: int,
    code: str,
    locale: str | None,
) -> bool:
    if not code:
        await message.answer(t(locale, "access_code_invalid"))
        return False
    result = await api_client.assign_affiliate_code(
        {"telegram_id": user_id, "code": code}, BOT_TO_API_SECRET
    )
    if result.get("status_code") == 409:
        await message.answer(t(locale, "access_code_already_assigned"))
        return False
    if result.get("status_code") == 400:
        error = (result.get("data") or {}).get("error")
        if error == "SELF_CODE":
            await message.answer(t(locale, "access_code_self"))
            return False
        await message.answer(t(locale, "access_code_invalid"))
        return False
    if result.get("status_code") and result.get("status_code") >= 400:
        await message.answer(t(locale, "access_code_invalid"))
        return False
    await message.answer(t(locale, "access_code_accepted"))
    return True


@router.message(Command("start"))
async def handle_start(message: Message, state: FSMContext) -> None:
    if not message.from_user:
        return
    clear_main_message_id(message.from_user.id)
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

    if message.from_user.id not in ADMIN_TELEGRAM_IDS:
        try:
            user_data = await api_client.get_user(message.from_user.id)
            referred = (user_data.get("user") or {}).get("referred_by_affiliate_id")
        except Exception:
            referred = None

        if referred:
            if start_payload:
                await message.answer(t(locale, "access_code_already_assigned"))
            locale = await get_user_locale(
                api_client, message.from_user.id, message.from_user.language_code
            )
            await state.clear()
            await render_home_view(message, message.from_user.id, locale)
            return

        if start_payload:
            locale = await get_user_locale(
                api_client, message.from_user.id, message.from_user.language_code
            )
            accepted = await _assign_access_code(
                message, message.from_user.id, start_payload, locale
            )
            if accepted:
                await state.clear()
                await render_home_view(message, message.from_user.id, locale)
                return
            await state.set_state(AccessStates.awaiting_code)
            return

        locale = await get_user_locale(
            api_client, message.from_user.id, message.from_user.language_code
        )
        await message.answer(t(locale, "access_code_prompt"))
        await state.set_state(AccessStates.awaiting_code)
        return

    locale = await get_user_locale(
        api_client, message.from_user.id, message.from_user.language_code
    )
    await state.clear()
    await render_home_view(message, message.from_user.id, locale)


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
    await render_home_view(
        callback.message,
        callback.from_user.id,
        locale,
    )
    await callback.answer()


@router.message(AccessStates.awaiting_code, F.text)
async def handle_access_code_message(message: Message, state: FSMContext) -> None:
    if not message.from_user:
        return
    locale = await get_user_locale(
        api_client, message.from_user.id, message.from_user.language_code
    )
    code = (message.text or "").strip()
    if not code:
        await message.answer(t(locale, "access_code_wait_numeric"))
        return
    if not (code.isdigit() or re.match(r"^[0-9a-fA-F-]{32,36}$", code)):
        await message.answer(t(locale, "access_code_wait_numeric"))
        return

    try:
        user_data = await api_client.get_user(message.from_user.id)
        referred = (user_data.get("user") or {}).get("referred_by_affiliate_id")
    except Exception:
        referred = None

    if referred:
        await message.answer(t(locale, "access_code_already_assigned"))
        await state.clear()
        await render_home_view(message, message.from_user.id, locale)
        return

    accepted = await _assign_access_code(message, message.from_user.id, code, locale)
    if accepted:
        logger.info("access_code_valid user=%s", message.from_user.id)
        await state.clear()
        await render_home_view(message, message.from_user.id, locale)
        return
    logger.info("access_code_invalid user=%s", message.from_user.id)
    await state.set_state(AccessStates.awaiting_code)


@router.callback_query(AccessStates.awaiting_code)
async def handle_access_code_callback(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    await callback.answer(t(locale, "access_code_required"), show_alert=True)


@router.callback_query(F.data == "nav:back")
async def handle_nav_back(callback: CallbackQuery) -> None:
    if not callback.message or not callback.from_user:
        return
    previous = pop_previous_view(callback.from_user.id)
    if not previous:
        locale = await get_user_locale(
            api_client, callback.from_user.id, callback.from_user.language_code
        )
        await render_home_view(
            callback.message,
            callback.from_user.id,
            locale,
            push_history=False,
        )
        await callback.answer()
        return
    previous_photo = previous.get("photo")
    if previous_photo:
        await render_main_view_with_photo(
            callback.message,
            callback.from_user.id,
            str(previous.get("text") or ""),
            previous_photo,
            reply_markup=previous.get("reply_markup"),
            parse_mode=previous.get("parse_mode"),
            push_history=False,
        )
    else:
        await render_main_view(
            callback.message,
            callback.from_user.id,
            str(previous.get("text") or ""),
            reply_markup=previous.get("reply_markup"),
            parse_mode=previous.get("parse_mode"),
            push_history=False,
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
async def handle_home_soon(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    if callback.data == "home:soon:soporte":
        await start_support_flow(callback.message, callback.from_user, state)
        await callback.answer()
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
                    text=t(locale, "btn_back"), callback_data="nav:back"
                ),
                InlineKeyboardButton(
                    text=t(locale, "btn_home"), callback_data="home:show"
                ),
            ]
        ]
    )
    community_image_url = await get_bot_asset_image(
        api_client, "community_image_url", BOT_COMMUNITY_IMAGE_URL
    )
    if community_image_url:
        await render_main_view_with_photo(
            callback.message,
            callback.from_user.id,
            build_community_text(locale),
            community_image_url,
            reply_markup=keyboard,
            parse_mode="HTML",
        )
    else:
        await render_main_view(
            callback.message,
            callback.from_user.id,
            build_community_text(locale),
            reply_markup=keyboard,
            parse_mode="HTML",
        )
    await callback.answer()
