from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from ..config import API_BASE_URL, API_TOKEN
from ..services.api_client import ApiClient
from ..services.i18n import t
from ..services.user_locale import get_user_locale, invalidate_user_locale
from ..utils.main_view import render_main_view, set_main_message_id
from .menu import build_home_text, build_main_keyboard

router = Router()
api_client = ApiClient(API_BASE_URL, API_TOKEN)


def _normalize_locale(arg: str | None, language_code: str | None) -> str:
    if arg:
        arg_norm = arg.strip().lower()
        if arg_norm in ("es", "en"):
            return arg_norm
        return ""
    if not language_code:
        return "es"
    if (language_code or "").lower().startswith("es"):
        return "es"
    return "en"


@router.message(Command("lang"))
async def handle_lang(message: Message) -> None:
    if not message.from_user:
        return

    args = (message.text or "").split()
    arg = args[1] if len(args) > 1 else None

    locale = await get_user_locale(
        api_client, message.from_user.id, message.from_user.language_code
    )

    if not arg:
        await message.answer(
            f"{t(locale, 'lang_current')}\n\n{t(locale, 'lang_help')}",
            parse_mode="HTML",
        )
        return

    new_locale = _normalize_locale(arg, message.from_user.language_code)
    if not new_locale:
        await message.answer(t(locale, "lang_invalid"), parse_mode="HTML")
        return

    try:
        await api_client.set_user_locale(message.from_user.id, new_locale)
    except Exception:
        await message.answer(t(locale, "lang_save_failed"), parse_mode="HTML")
        return
    invalidate_user_locale(message.from_user.id)

    if new_locale == "es":
        await message.answer(t("es", "lang_set_es"), parse_mode="HTML")
    else:
        await message.answer(t("en", "lang_set_en"), parse_mode="HTML")


@router.callback_query(F.data.startswith("lang:set:"))
async def handle_lang_set(callback: CallbackQuery) -> None:
    if not callback.message or not callback.from_user:
        return
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    parts = callback.data.split(":")
    locale = parts[-1].lower() if parts else "es"
    if locale not in ("es", "en"):
        locale = "es"
    try:
        await api_client.set_user_locale(callback.from_user.id, locale)
    except Exception as exc:
        print("[LANG] set_user_locale failed:", repr(exc))
        await callback.answer(t(locale, "lang_save_failed"), show_alert=True)
        return
    invalidate_user_locale(callback.from_user.id)
    await render_main_view(
        callback.message,
        callback.from_user.id,
        build_home_text(locale),
        reply_markup=build_main_keyboard(locale),
        parse_mode="HTML",
    )
    await callback.answer()
