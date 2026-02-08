from aiogram.types import Message

from ..config import API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET
from ..handlers.menu import build_home_text, build_main_keyboard
from ..services.api_client import ApiClient
from ..services.bot_assets import get_bot_asset_image
from ..utils.main_view import render_main_view, render_main_view_with_photo

_api_client = ApiClient(API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET)

async def get_home_photo() -> str | None:
    image_url = await get_bot_asset_image(_api_client, "main_image_url")
    if image_url:
        return image_url
    return None


async def render_home_view(
    message: Message,
    user_id: int,
    locale: str | None,
    *,
    push_history: bool = True,
) -> None:
    home_text = build_home_text(locale)
    home_photo = await get_home_photo()
    if home_photo:
        await render_main_view_with_photo(
            message,
            user_id,
            home_text,
            home_photo,
            reply_markup=build_main_keyboard(locale),
            parse_mode="HTML",
            push_history=push_history,
        )
        return
    await render_main_view(
        message,
        user_id,
        home_text,
        reply_markup=build_main_keyboard(locale),
        parse_mode="HTML",
        push_history=push_history,
    )
