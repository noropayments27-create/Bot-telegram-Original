import time
from typing import Dict

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message, User

from ..config import (
    API_BASE_URL,
    API_TOKEN,
    BOT_SUPPORT_IMAGE_URL,
    BOT_RATE_LIMIT_ENABLED,
    BOT_RATE_LIMIT_SECONDS,
    BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    BOT_TO_API_SECRET,
)
from ..services.api_client import ApiClient
from ..services.bot_assets import get_bot_asset_image
from ..services.i18n import t
from ..services.user_locale import get_user_locale
from .menu import build_main_keyboard
from ..utils.main_view import render_main_view, render_main_view_with_photo, set_main_message_id
from ..utils.rate_limit import check_global_rate_limit

router = Router()
api_client = ApiClient(API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET)
_IMAGE_DUPLICATE_TTL_SECONDS = 24 * 60 * 60
_SUPPORT_IMAGE_CACHE: Dict[int, Dict[str, float]] = {}


class SupportStates(StatesGroup):
    active = State()


def _is_duplicate_user_image(
    cache: Dict[int, Dict[str, float]], user_id: int, unique_id: str
) -> bool:
    if not unique_id:
        return False
    now = time.time()
    cutoff = now - _IMAGE_DUPLICATE_TTL_SECONDS
    user_cache = cache.get(user_id, {})
    if user_cache:
        user_cache = {key: ts for key, ts in user_cache.items() if ts >= cutoff}
    if unique_id in user_cache:
        cache[user_id] = user_cache
        return True
    user_cache[unique_id] = now
    cache[user_id] = user_cache
    return False


def _build_support_menu_keyboard(locale: str | None) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=t(locale, "support_subject_purchase"),
                    callback_data="support:purchase",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "support_subject_bug"),
                    callback_data="support:bug",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_back"),
                    callback_data="nav:back",
                ),
                InlineKeyboardButton(
                    text=t(locale, "btn_home"),
                    callback_data="home:show",
                ),
            ],
        ]
    )


def _build_support_prompt_keyboard(locale: str | None) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_back"),
                    callback_data="nav:back",
                ),
                InlineKeyboardButton(
                    text=t(locale, "btn_home"),
                    callback_data="home:show",
                ),
            ]
        ]
    )


def _build_support_menu_text(locale: str | None) -> str:
    return f"{t(locale, 'support_menu_title')}\n\n{t(locale, 'support_menu_body')}"


async def _render_support_view(
    message: Message,
    user_id: int,
    text: str,
    *,
    reply_markup: InlineKeyboardMarkup | None = None,
    parse_mode: str | None = None,
) -> None:
    support_image_url = await get_bot_asset_image(
        api_client, "support_image_url", BOT_SUPPORT_IMAGE_URL
    )
    if support_image_url:
        await render_main_view_with_photo(
            message,
            user_id,
            text,
            support_image_url,
            reply_markup=reply_markup,
            parse_mode=parse_mode,
        )
        return
    await render_main_view(
        message,
        user_id,
        text,
        reply_markup=reply_markup,
        parse_mode=parse_mode,
    )


@router.message(Command("cancel"))
async def handle_cancel(message: Message, state: FSMContext) -> None:
    locale = "es"
    if message.from_user:
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
    await state.clear()
    await message.answer(
        t(locale, "support_cancelled"), reply_markup=build_main_keyboard(locale)
    )


async def start_support_flow(
    message: Message,
    user: User,
    state: FSMContext,
    *,
    subject: str | None = None,
    prompt_text: str | None = None,
) -> None:
    if not user:
        return
    locale = await get_user_locale(
        api_client, user.id, user.language_code
    )
    wait_seconds = check_global_rate_limit(
        user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await message.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds)
        )
        return

    payload = {
        "telegram_id": user.id,
        "telegram_username": user.username,
        "subject": subject or t(locale, "support_subject_default"),
    }

    result = await api_client.open_or_create_ticket(payload)

    if result.get("status_code") == 403:
        await state.clear()
        await _render_support_view(
            message,
            user.id,
            t(locale, "support_banned"),
            reply_markup=_build_support_prompt_keyboard(locale),
        )
        return

    if result.get("status_code") == 409:
        await state.set_state(SupportStates.active)
        await _render_support_view(
            message,
            user.id,
            t(locale, "support_wait_admin_reply"),
            reply_markup=_build_support_prompt_keyboard(locale),
        )
        return
    if result.get("status_code") == 400:
        await state.set_state(SupportStates.active)
        await state.update_data(support_subject=subject or t(locale, "support_subject_default"))
        await _render_support_view(
            message,
            user.id,
            prompt_text or t(locale, "support_prompt_description"),
            reply_markup=_build_support_prompt_keyboard(locale),
        )
        return

    data = result.get("data", {})
    ticket = data.get("ticket")
    if ticket:
        await state.update_data(ticket_id=ticket["id"])
        await state.set_state(SupportStates.active)
    await state.update_data(support_subject=subject or t(locale, "support_subject_default"))
    await _render_support_view(
        message,
        user.id,
        prompt_text or t(locale, "support_prompt_description"),
        reply_markup=_build_support_prompt_keyboard(locale),
    )


@router.message(Command("soporte"))
@router.message(Command("support"))
@router.message(F.text.in_({"🆘 Soporte", "🆘 Support"}))
async def handle_support(message: Message, state: FSMContext) -> None:
    if not message.from_user:
        return
    locale = await get_user_locale(
        api_client, message.from_user.id, message.from_user.language_code
    )
    await _render_support_view(
        message,
        message.from_user.id,
        _build_support_menu_text(locale),
        reply_markup=_build_support_menu_keyboard(locale),
    )


@router.callback_query(F.data == "home:support")
async def handle_support_callback(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message:
        return
    if not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    await _render_support_view(
        callback.message,
        callback.from_user.id,
        _build_support_menu_text(locale),
        reply_markup=_build_support_menu_keyboard(locale),
    )
    await callback.answer()


@router.callback_query(F.data == "support:purchase")
async def handle_support_purchase(callback: CallbackQuery, state: FSMContext) -> None:
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
    await start_support_flow(
        callback.message,
        callback.from_user,
        state,
        subject=t(locale, "support_subject_purchase"),
    )
    await callback.answer()


@router.callback_query(F.data == "support:bug")
async def handle_support_bug(callback: CallbackQuery, state: FSMContext) -> None:
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
    await start_support_flow(
        callback.message,
        callback.from_user,
        state,
        subject=t(locale, "support_subject_bug"),
        prompt_text=t(locale, "support_prompt_bug"),
    )
    await callback.answer()


@router.message(SupportStates.active, F.text)
async def handle_support_message(message: Message, state: FSMContext) -> None:
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

    text = message.text.strip()
    if not text or text.startswith("/"):
        return

    data = await state.get_data()
    ticket_id = data.get("ticket_id")

    payload = {
        "telegram_id": message.from_user.id,
        "message": text,
    }

    if not ticket_id:
        subject = data.get("support_subject") or t(locale, "support_subject_default")
        payload.update(
            {
                "telegram_username": message.from_user.username,
                "subject": subject,
            }
        )
        result = await api_client.open_or_create_ticket(payload)
        if result.get("status_code") == 403:
            await message.answer(t(locale, "support_banned"))
            await state.clear()
            return
        if result.get("status_code") == 409:
            await message.answer(t(locale, "support_wait_admin_reply"))
            return
        data = result.get("data", {})
        ticket = data.get("ticket")
        if ticket:
            await state.update_data(ticket_id=ticket["id"])
            await state.set_state(SupportStates.active)
        await message.answer(t(locale, "support_message_received"))
        return

    result = await api_client.send_ticket_message(ticket_id, payload)
    if result.get("status_code") == 403:
        await message.answer(t(locale, "support_banned"))
        await state.clear()
        return
    if result.get("status_code") == 409:
        await message.answer(t(locale, "support_wait_admin_reply"))
        return
    await message.answer(t(locale, "support_message_received"))


@router.message(F.photo)
async def handle_support_photo(message: Message, state: FSMContext) -> None:
    if not message.photo or not message.from_user:
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
    unique_id = message.photo[-1].file_unique_id
    if _is_duplicate_user_image(_SUPPORT_IMAGE_CACHE, message.from_user.id, unique_id):
        await message.answer(t(locale, "duplicate_image_warning"))
        return

    active = await api_client.get_active_ticket(message.from_user.id)
    ticket = active.get("ticket")
    if not ticket:
        await message.answer(t(locale, "support_no_active_ticket"))
        await state.clear()
        return
    if not ticket.get("allow_image"):
        await message.answer(t(locale, "support_image_not_allowed"))
        return

    file_id = message.photo[-1].file_id
    file_unique_id = message.photo[-1].file_unique_id
    payload = {
        "telegram_id": message.from_user.id,
        "telegram_file_id": file_id,
        "telegram_file_unique_id": file_unique_id,
    }
    result = await api_client.send_ticket_message(ticket["id"], payload)
    if result.get("status_code") == 403:
        await message.answer(t(locale, "support_banned"))
        await state.clear()
        return
    if result.get("status_code") == 409:
        error_code = (result.get("data") or {}).get("error")
        if error_code == "DUPLICATE_IMAGE":
            await message.answer(t(locale, "duplicate_image_warning"))
        else:
            await message.answer(t(locale, "support_image_not_allowed"))
        return
    await message.answer(t(locale, "support_image_received"))


@router.message(F.document)
async def handle_support_document(message: Message, state: FSMContext) -> None:
    if not message.document or not message.from_user:
        return
    if not message.document.mime_type or not message.document.mime_type.startswith("image/"):
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
    unique_id = message.document.file_unique_id
    if _is_duplicate_user_image(_SUPPORT_IMAGE_CACHE, message.from_user.id, unique_id):
        await message.answer(t(locale, "duplicate_image_warning"))
        return

    active = await api_client.get_active_ticket(message.from_user.id)
    ticket = active.get("ticket")
    if not ticket:
        await message.answer(t(locale, "support_no_active_ticket"))
        await state.clear()
        return
    if not ticket.get("allow_image"):
        await message.answer(t(locale, "support_image_not_allowed"))
        return

    payload = {
        "telegram_id": message.from_user.id,
        "telegram_file_id": message.document.file_id,
        "telegram_file_unique_id": message.document.file_unique_id,
    }
    result = await api_client.send_ticket_message(ticket["id"], payload)
    if result.get("status_code") == 403:
        await message.answer(t(locale, "support_banned"))
        await state.clear()
        return
    if result.get("status_code") == 409:
        error_code = (result.get("data") or {}).get("error")
        if error_code == "DUPLICATE_IMAGE":
            await message.answer(t(locale, "duplicate_image_warning"))
        else:
            await message.answer(t(locale, "support_image_not_allowed"))
        return
    await message.answer(t(locale, "support_image_received"))
