import os

from aiogram.types import FSInputFile, Message

from ..config import BOT_MAIN_IMAGE_URL
from ..handlers.menu import build_home_text, build_main_keyboard
from ..utils.main_view import render_main_view_with_photo


def get_home_photo() -> str | FSInputFile:
    if BOT_MAIN_IMAGE_URL:
        return BOT_MAIN_IMAGE_URL
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
        get_home_photo(),
        reply_markup=build_main_keyboard(locale),
        parse_mode="HTML",
        push_history=push_history,
    )
