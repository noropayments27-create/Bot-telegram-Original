from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from ..config import (
    API_BASE_URL,
    API_TOKEN,
    BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    BOT_RATE_LIMIT_ENABLED,
    BOT_RATE_LIMIT_SECONDS,
)
from ..services.api_client import ApiClient
from .menu import build_main_menu, build_main_keyboard
from ..utils.rate_limit import check_global_rate_limit

router = Router()
api_client = ApiClient(API_BASE_URL, API_TOKEN)


@router.message(Command("start"))
async def handle_start(message: Message) -> None:
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
    status_line = "API no disponible"
    start_payload = None

    if message.text:
        parts = message.text.split(maxsplit=1)
        if len(parts) > 1:
            start_payload = parts[1].strip() or None

    try:
        payload = {
            "telegram_id": message.from_user.id,
            "username": message.from_user.username,
            "first_name": message.from_user.first_name,
            "last_name": message.from_user.last_name,
            "language_code": message.from_user.language_code,
            "start_payload": start_payload,
            "start_affiliate_code": start_payload,
        }
        result = await api_client.upsert_telegram_user(payload)
        if result["status_code"] == 403:
            await message.answer("Acceso restringido.")
            return
        status_line = "API disponible"
    except Exception:
        status_line = "API no disponible"

    text = (
        "Bienvenido al bot de ventas.\n"
        f"{status_line}\n\n"
        f"{build_main_menu()}"
    )

    await message.answer(text, reply_markup=build_main_keyboard())
