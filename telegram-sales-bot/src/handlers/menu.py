from aiogram import Router
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

router = Router()


HOME_TEXT = (
    "Bienvenido a:\n"
    "Noropayments shop\n\n"
    "Tenemos muchas cosas a la venta\n\n"
    "¿Que deseas Comprar hoy?"
)


def build_home_text() -> str:
    return HOME_TEXT


def build_main_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="🏪 Tienda", callback_data="shop:page:1"),
                InlineKeyboardButton(text="✅ Métodos", callback_data="home:soon:metodos"),
            ],
            [
                InlineKeyboardButton(text="💬 Grupos VIP", callback_data="home:soon:vip"),
                InlineKeyboardButton(text="💻 Programas y Web", callback_data="home:soon:programas"),
            ],
            [
                InlineKeyboardButton(text="🛒 Carrito", callback_data="home:cart"),
                InlineKeyboardButton(text="📢 Afiliados", callback_data="home:soon:afiliados"),
            ],
            [
                InlineKeyboardButton(text="👥 Comunidad", callback_data="home:soon:comunidad"),
                InlineKeyboardButton(text="🆘 Soporte", callback_data="home:soon:soporte"),
            ],
            [
                InlineKeyboardButton(text="🌐 Idioma", callback_data="home:soon:idioma"),
            ],
        ]
    )
