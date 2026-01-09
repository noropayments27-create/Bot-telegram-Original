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
)
from ..services.api_client import ApiClient
from .menu import build_main_keyboard
from ..utils.rate_limit import check_global_rate_limit

router = Router()
api_client = ApiClient(API_BASE_URL, API_TOKEN)


class SupportStates(StatesGroup):
    active = State()


@router.message(Command("cancel"))
async def handle_cancel(message: Message, state: FSMContext) -> None:
    if message.from_user:
        wait_seconds = check_global_rate_limit(
            message.from_user.id,
            BOT_RATE_LIMIT_SECONDS,
            BOT_RATE_LIMIT_ENABLED,
            BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
        )
        if wait_seconds > 0:
            await message.answer(
                f"⏳ Espera {wait_seconds}s antes de intentar de nuevo."
            )
            return
    await state.clear()
    await message.answer("✅ Soporte cancelado. Si necesitas algo más, aquí estoy. 😊", reply_markup=build_main_keyboard())


@router.message(Command("soporte"))
@router.message(F.text == "🆘 Soporte")
async def handle_support(message: Message, state: FSMContext) -> None:
    if not message.from_user:
        return
    wait_seconds = check_global_rate_limit(
        message.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await message.answer(f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.")
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
            "🕒 Ya tienes un ticket abierto. En cuanto responda, podrás abrir otro. 🙏\n"
            "Si quieres agregar informacion, escribela aqui y la anexare al ticket."
        )
        return

    data = result.get("data", {})
    ticket = data.get("ticket")
    if ticket:
        await state.update_data(ticket_id=ticket["id"])
        await state.set_state(SupportStates.active)

    await message.answer(
        "✅ Ticket creado. Cuéntame tu problema y te respondo lo antes posible. 🙌"
    )


@router.message(SupportStates.active, F.text)
async def handle_support_message(message: Message, state: FSMContext) -> None:
    if not message.from_user:
        return
    wait_seconds = check_global_rate_limit(
        message.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await message.answer(f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.")
        return

    text = message.text.strip()
    if not text or text.startswith("/"):
        return

    data = await state.get_data()
    ticket_id = data.get("ticket_id")
    if not ticket_id:
        await message.answer("ℹ️ No tienes un ticket activo en este momento.")
        await state.clear()
        return

    payload = {
        "telegram_id": message.from_user.id,
        "message": text,
    }

    await api_client.send_ticket_message(ticket_id, payload)
    await message.answer("📨 ¡Mensaje recibido! Te responderé lo antes posible. 🙌")
