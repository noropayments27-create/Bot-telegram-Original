from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import Message

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


@router.message(Command("soporte"))
@router.message(F.text == "🆘 Soporte")
async def handle_support(message: Message, state: FSMContext) -> None:
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

    payload = {
        "telegram_id": message.from_user.id,
        "telegram_username": message.from_user.username,
        "subject": "Soporte",
    }

    result = await api_client.open_or_create_ticket(payload)

    if result.get("status_code") == 409:
        ticket = result.get("data", {}).get("ticket")
        if ticket:
            await state.update_data(ticket_id=ticket["id"])
            await state.set_state(SupportStates.active)
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

    await api_client.send_ticket_message(ticket_id, payload)
    await message.answer(t(locale, "support_message_received"))
