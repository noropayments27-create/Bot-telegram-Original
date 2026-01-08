from aiogram import Router
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

router = Router()


HOME_TEXT = (
    "Bienvenido a:\n"
    "Noropayments shop\n\n"
    "Tenemos muchas cosas a la venta\n\n"
    "¿Que deseas Comprar hoy?"
)
COMMUNITY_TEXT_HTML = (
    "Información:\n\n"
    "🖥 Mi Pagina Web:  <a href=\"https://noropayments.shop/\">CLICK AQUI</a> ⬅️\n"
    "⭐️ Mi Canal de promos:  <a href=\"https://t.me/promos_noro\">CLICK AQUI</a> ⬅️\n"
    "🔎 Mis Referencias de ventas: <a href=\"https://t.me/Nororeferencias\">CLICK AQUI</a> ⬅️\n"
    "🛡 Mi Grupo Privado: <a href=\"https://t.me/+3qNiiq16iXM2YjEx\">CLICK AQUI</a> ⬅️\n"
    "🆓 Grupo Ventas Free: <a href=\"https://t.me/VentasNoropayments\">CLICK AQUI</a> ⬅️\n"
    "⚙️ Grupo de Bins Gratis: <a href=\"https://t.me/BinsGratis_NoroPayments\">CLICK AQUI</a> ⬅️\n\n"
    "✅ Ofertas exclusivas\n"
    "✅ Información actualizada\n"
    "✅Contenido directo y sin vueltas\n\n"
    "SI TIENES PREGUNTAS NO DUDES EN ACUDIR A NOSOTROS\n\n"
    "Youtube:   <a href=\"https://www.youtube.com/@Noropayments\">CLICK AQUI</a>\n"
    "TikTok:    <a href=\"https://www.tiktok.com/@noro_payments1\">CLICK AQUI</a>\n"
    "Whatsapp:  <a href=\"https://api.whatsapp.com/send/?phone=573009545964&text=Hola%2C+vengo+de+Telegram&type=phone_number&app_absent=0\">CLICK AQUI</a>\n"
    "Telegram:  <a href=\"https://t.me/NoroPayments\">CLICK AQUI</a>\n"
    "Instagram: <a href=\"https://www.instagram.com/noropayments\">CLICK AQUI</a>\n"
    "(Twitter) X: <a href=\"https://x.com/NoroPayments\">CLICK AQUI</a>\n\n"
    "🔥 ¡Síguenos yá! y no te pierdas nada 🔥"
)


def build_home_text() -> str:
    return HOME_TEXT


def build_community_text() -> str:
    return COMMUNITY_TEXT_HTML


def build_main_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="🏪 Tienda", callback_data="shop:page:1"),
                InlineKeyboardButton(text="✅ Métodos", callback_data="category:page:metodos"),
            ],
            [
                InlineKeyboardButton(text="💬 Grupos VIP", callback_data="category:page:vip"),
                InlineKeyboardButton(
                    text="💻 Programas y Web", callback_data="category:page:programas"
                ),
            ],
            [
                InlineKeyboardButton(text="🛒 Carrito", callback_data="home:cart"),
                InlineKeyboardButton(text="📢 Afiliados", callback_data="home:soon:afiliados"),
            ],
            [
                InlineKeyboardButton(text="👥 Comunidad", callback_data="home:community"),
                InlineKeyboardButton(text="🆘 Soporte", callback_data="home:soon:soporte"),
            ],
            [
                InlineKeyboardButton(text="🌐 Idioma", callback_data="home:soon:idioma"),
            ],
        ]
    )
