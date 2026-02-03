import os

from aiogram.types import FSInputFile, Message

from ..config import API_BASE_URL, API_TOKEN, BOT_MAIN_IMAGE_URL, BOT_TO_API_SECRET
from ..handlers.menu import build_home_text, build_main_keyboard
from ..services.api_client import ApiClient
from ..services.bot_assets import get_bot_asset_image
from ..utils.main_view import render_main_view_with_photo

_api_client = ApiClient(API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET)

async def get_home_photo() -> str | FSInputFile:
    image_url = await get_bot_asset_image(
        _api_client, "main_image_url", BOT_MAIN_IMAGE_URL
    )
    if image_url:
        return image_url
    return FSInputFile(
        os.path.join(os.path.dirname(__file__), "..", "..", "assets", "bot-noropayments.png")
    )


async def render_home_view(
    message: Message,
    user_id: int,
    locale: str | None,
    *,
    push_history: bool = True,
) -> None:
    await render_main_view_with_photo(
        message,
        user_id,
        build_home_text(locale),
        await get_home_photo(),
        reply_markup=build_main_keyboard(locale),
        parse_mode="HTML",
        push_history=push_history,
    )
