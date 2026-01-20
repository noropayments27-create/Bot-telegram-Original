from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message, User

from ..config import (
    API_BASE_URL,
    API_TOKEN,
    BOT_RATE_LIMIT_ENABLED,
    BOT_RATE_LIMIT_SECONDS,
    BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    BOT_TO_API_SECRET,
)
from ..services.api_client import ApiClient
from ..services.i18n import t
from ..services.user_locale import get_user_locale
from .menu import build_main_keyboard
from ..utils.rate_limit import check_global_rate_limit

router = Router()
api_client = ApiClient(API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET)


class SupportStates(StatesGroup):
    active = State()


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


async def start_support_flow(message: Message, user: User, state: FSMContext) -> None:
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
        "subject": "Soporte",
    }

    result = await api_client.open_or_create_ticket(payload)

    if result.get("status_code") == 403:
        await state.clear()
        await message.answer(t(locale, "support_banned"))
        return

    if result.get("status_code") == 409:
        await state.clear()
        await message.answer(
            t(locale, "support_ticket_open")
        )
        return

    data = result.get("data", {})
    ticket = data.get("ticket")
    if ticket:
        await state.update_data(ticket_id=ticket["id"])
        await state.set_state(SupportStates.active)

    await message.answer(
        t(locale, "support_ticket_created")
    )


@router.message(Command("soporte"))
@router.message(F.text == "🆘 Soporte")
async def handle_support(message: Message, state: FSMContext) -> None:
    if not message.from_user:
        return
    await start_support_flow(message, message.from_user, state)


@router.callback_query(F.data == "home:support")
async def handle_support_callback(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message:
        return
    if not callback.from_user:
        return
    await start_support_flow(callback.message, callback.from_user, state)
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
    if not ticket_id:
        await message.answer(t(locale, "support_no_active_ticket"))
        await state.clear()
        return

    payload = {
        "telegram_id": message.from_user.id,
        "message": text,
    }

    result = await api_client.send_ticket_message(ticket_id, payload)
    if result.get("status_code") == 403:
        await message.answer(t(locale, "support_banned"))
        await state.clear()
        return
    await message.answer(t(locale, "support_message_received"))
    await state.clear()


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
    payload = {
        "telegram_id": message.from_user.id,
        "telegram_file_id": file_id,
    }
    result = await api_client.send_ticket_message(ticket["id"], payload)
    if result.get("status_code") == 403:
        await message.answer(t(locale, "support_banned"))
        await state.clear()
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
    }
    result = await api_client.send_ticket_message(ticket["id"], payload)
    if result.get("status_code") == 403:
        await message.answer(t(locale, "support_banned"))
        await state.clear()
        return
    await message.answer(t(locale, "support_image_received"))
