from aiogram import Router
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from ..services.i18n import t

router = Router()


def build_home_text(locale: str | None = None) -> str:
    return t(locale, "home_welcome")


def build_community_text(locale: str | None = None) -> str:
    return t(locale, "community_text")


def build_main_keyboard(locale: str | None = None) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=t(locale, "menu_shop"), callback_data="shop:page:1"
                ),
                InlineKeyboardButton(
                    text=t(locale, "menu_methods"),
                    callback_data="category:page:metodos",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "menu_groups"), callback_data="category:page:vip"
                ),
                InlineKeyboardButton(
                    text=t(locale, "menu_programs"),
                    callback_data="category:page:programas",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "menu_cart"), callback_data="home:cart"
                ),
                InlineKeyboardButton(
                    text=t(locale, "menu_affiliates"),
                    callback_data="home:affiliates",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "menu_community"), callback_data="home:community"
                ),
                InlineKeyboardButton(
                    text=t(locale, "menu_support"), callback_data="home:soon:soporte"
                ),
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "menu_language"),
                    callback_data="home:soon:idioma",
                ),
            ],
        ]
    )


def build_language_keyboard(locale: str | None = None) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_language_es"), callback_data="lang:set:es"
                ),
                InlineKeyboardButton(
                    text=t(locale, "btn_language_en"), callback_data="lang:set:en"
                ),
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_language_back"),
                    callback_data="nav:back",
                ),
            ],
        ]
    )
