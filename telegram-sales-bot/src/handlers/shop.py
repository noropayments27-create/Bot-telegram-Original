from datetime import datetime
from typing import Any, Dict, List, Optional

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)

from ..services.api_client import ApiClient
from ..config import (
    API_BASE_URL,
    API_TOKEN,
    BOT_RATE_LIMIT_ADMIN_BYPASS_TELEGRAM_IDS,
    BOT_RATE_LIMIT_ENABLED,
    BOT_RATE_LIMIT_PAID_SECONDS,
    BOT_RATE_LIMIT_SCREENSHOT_SECONDS,
    BOT_RATE_LIMIT_SHOP_SECONDS,
)
from ..utils.rate_limit import check_rate_limit

router = Router()
api_client = ApiClient(API_BASE_URL, API_TOKEN)


class PaymentStates(StatesGroup):
    waiting_photo = State()


def build_shop_keyboard(items: List[Dict[str, Any]], page: int, total_pages: int) -> InlineKeyboardMarkup:
    rows: List[List[InlineKeyboardButton]] = []

    for item in items:
        rows.append(
            [
                InlineKeyboardButton(
                    text=f"Comprar {item['name']}",
                    callback_data=f"shop:buy:{item['id']}",
                )
            ]
        )

    nav: List[InlineKeyboardButton] = []
    if page > 1:
        nav.append(
            InlineKeyboardButton(
                text="⬅️ Anterior", callback_data=f"shop:page:{page - 1}"
            )
        )
    if page < total_pages:
        nav.append(
            InlineKeyboardButton(
                text="➡️ Siguiente", callback_data=f"shop:page:{page + 1}"
            )
        )
    if nav:
        rows.append(nav)

    return InlineKeyboardMarkup(inline_keyboard=rows)


def format_products(items: List[Dict[str, Any]], page: int, total_pages: int) -> str:
    if not items:
        return "No hay mas productos disponibles."

    lines = [f"Tienda (pagina {page}/{total_pages})\n"]
    for idx, item in enumerate(items, start=1):
        price = item.get("price")
        lines.append(f"{idx}. {item['name']} - ${price}")
        if item.get("description"):
            lines.append(f"   {item['description']}")
    return "\n".join(lines)


async def send_shop_page(target: Message, page: int) -> None:
    data = await api_client.list_products(page=page, page_size=8)
    items = data.get("items", [])
    total_pages = data.get("total_pages", 1)

    if not items:
        await target.answer("No hay mas productos disponibles.")
        return

    text = format_products(items, page, total_pages)
    await target.answer(text, reply_markup=build_shop_keyboard(items, page, total_pages))


@router.message(Command("shop"))
@router.message(F.text == "🛒 Tienda")
async def handle_shop(message: Message) -> None:
    if not message.from_user:
        return
    wait_seconds = check_rate_limit(
        message.from_user.id,
        "shop",
        BOT_RATE_LIMIT_SHOP_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_ADMIN_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await message.answer(f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.")
        return
    await send_shop_page(message, 1)


@router.callback_query(F.data.startswith("shop:page:"))
async def handle_shop_page(callback: CallbackQuery) -> None:
    if not callback.message or not callback.from_user:
        return
    wait_seconds = check_rate_limit(
        callback.from_user.id,
        "shop",
        BOT_RATE_LIMIT_SHOP_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_ADMIN_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.", show_alert=True
        )
        return
    page = int(callback.data.split(":")[-1])
    data = await api_client.list_products(page=page, page_size=8)
    items = data.get("items", [])
    total_pages = data.get("total_pages", 1)

    if not items:
        await callback.answer("No hay mas productos disponibles.", show_alert=True)
        return

    text = format_products(items, page, total_pages)
    await callback.message.edit_text(
        text, reply_markup=build_shop_keyboard(items, page, total_pages)
    )
    await callback.answer()


@router.callback_query(F.data.startswith("shop:buy:"))
async def handle_buy(callback: CallbackQuery) -> None:
    if not callback.message:
        return
    product_id = callback.data.split(":")[-1]
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Confirmar compra",
                    callback_data=f"order:create:{product_id}",
                )
            ]
        ]
    )
    await callback.message.answer(
        "Confirma la compra del producto seleccionado.", reply_markup=keyboard
    )
    await callback.answer()


@router.callback_query(F.data.startswith("order:create:"))
async def handle_create_order(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    product_id = callback.data.split(":")[-1]

    order_payload = {
        "telegram_id": callback.from_user.id,
        "product_id": product_id,
        "qty": 1,
        "username": callback.from_user.username,
    }

    result = await api_client.create_order(order_payload)
    order = result.get("order")
    instructions = result.get("payment_instructions", {})

    if not order:
        await callback.message.answer("No se pudo crear la orden.")
        await callback.answer()
        return

    await state.update_data(last_order_id=order["id"])

    text = (
        "Orden creada.\n"
        f"ID: {order['id']}\n"
        f"Total: ${order.get('total')}\n\n"
        "Instrucciones de pago:\n"
        f"Red: {instructions.get('network')}\n"
        f"Activo: {instructions.get('asset')}\n"
        f"Wallet: {instructions.get('wallet')}\n"
        f"Nota: {instructions.get('note')}"
    )

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ Ya pague", callback_data=f"order:pay:{order['id']}"
                ),
                InlineKeyboardButton(
                    text="📦 Ver estado",
                    callback_data=f"order:status:{order['id']}",
                ),
            ]
        ]
    )

    await callback.message.answer(text, reply_markup=keyboard)
    await callback.answer()


@router.callback_query(F.data.startswith("order:pay:"))
async def handle_pay(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    wait_seconds = check_rate_limit(
        callback.from_user.id,
        "paid",
        BOT_RATE_LIMIT_PAID_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_ADMIN_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.", show_alert=True
        )
        return
    order_id = callback.data.split(":")[-1]
    await state.update_data(order_id=order_id)
    await state.set_state(PaymentStates.waiting_photo)
    await callback.message.answer("Enviame la captura del pago.")
    await callback.answer()


@router.message(PaymentStates.waiting_photo, F.photo)
async def handle_payment_photo(message: Message, state: FSMContext) -> None:
    if not message.photo or not message.from_user:
        return
    wait_seconds = check_rate_limit(
        message.from_user.id,
        "screenshot",
        BOT_RATE_LIMIT_SCREENSHOT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_ADMIN_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await message.answer(f"⏳ Espera {wait_seconds}s antes de intentar de nuevo.")
        return

    data = await state.get_data()
    order_id = data.get("order_id")
    if not order_id:
        await message.answer("No tengo una orden pendiente.")
        await state.clear()
        return

    screenshot_file_id = message.photo[-1].file_id
    payload = {
        "telegram_id": message.from_user.id,
        "screenshot_file_id": screenshot_file_id,
    }

    await api_client.submit_payment_proof(order_id, payload)
    await message.answer("Recibido. Estamos verificando tu pago.")
    await state.clear()


@router.callback_query(F.data.startswith("order:status:"))
async def handle_status_callback(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message:
        return
    order_id = callback.data.split(":")[-1]
    await state.update_data(last_order_id=order_id)
    await send_order_status(callback.message, order_id)
    await callback.answer()


@router.message(F.text == "📦 Ver estado")
async def handle_status_message(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    order_id = data.get("last_order_id")
    if not order_id:
        await message.answer("No hay ordenes recientes para consultar.")
        return
    await send_order_status(message, order_id)


def format_receipt(order: Dict[str, Any]) -> str:
    total = order.get("unit_price_at_purchase")
    paid_at = order.get("paid_at") or order.get("created_at")
    paid_at_text = paid_at
    if isinstance(paid_at, datetime):
        paid_at_text = paid_at.isoformat()

    return (
        "Recibo digital\n"
        f"Orden: {order['id']}\n"
        f"Producto: {order.get('product_id')}\n"
        "Cantidad: 1\n"
        f"Total: ${total}\n"
        f"Fecha: {paid_at_text}\n"
        "Estado: PAGADA"
    )


async def send_order_status(target: Message, order_id: str) -> None:
    result = await api_client.get_order(order_id)
    order = result.get("order")

    if not order:
        await target.answer("No se encontro la orden.")
        return

    status = order.get("status")
    if status == "PAID":
        await target.answer(format_receipt(order))
    elif status == "WAITING_PAYMENT":
        await target.answer("Pago en revision.")
    elif status == "CREATED":
        await target.answer("Pendiente de pago.")
    elif status == "CANCELLED":
        await target.answer("Pago rechazado, contacta soporte.")
    else:
        await target.answer(f"Estado actual: {status}")
