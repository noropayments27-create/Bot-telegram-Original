from aiogram import Router
from aiogram.types import KeyboardButton, ReplyKeyboardMarkup

router = Router()


def build_main_menu() -> str:
    return "Opciones disponibles:  " \
    "\n- 🛒 Tienda\n- 📦 Ver estado\n- 🆘 Soporte\n"


def build_main_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text="🛒 Tienda"),
                KeyboardButton(text="📦 Ver estado"),
                KeyboardButton(text="🆘 Soporte"),
            ],
        ],
        resize_keyboard=True,
    )
