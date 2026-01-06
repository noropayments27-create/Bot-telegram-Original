import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage

from .config import TELEGRAM_BOT_TOKEN
from .handlers import start, shop, support


async def main() -> None:
    logging.basicConfig(level=logging.INFO)

    if not TELEGRAM_BOT_TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is required")

    bot = Bot(token=TELEGRAM_BOT_TOKEN)
    dp = Dispatcher(storage=MemoryStorage())

    dp.include_router(start.router)
    dp.include_router(shop.router)
    dp.include_router(support.router)

    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
