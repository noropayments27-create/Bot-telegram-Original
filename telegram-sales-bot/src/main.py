import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage

from .config import TELEGRAM_BOT_TOKEN
from .handlers import (
    admin_actions,
    admin_auth,
    admin_commands,
    affiliates,
    lang,
    start,
    shop,
    support,
)
from .middlewares.ban_guard import BanGuardMiddleware
from .middlewares.access_code import AccessCodeMiddleware
from .middlewares.maintenance_guard import MaintenanceGuardMiddleware


async def main() -> None:
    logging.basicConfig(level=logging.INFO)

    if not TELEGRAM_BOT_TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is required")

    bot = Bot(token=TELEGRAM_BOT_TOKEN)
    dp = Dispatcher(storage=MemoryStorage())

    maintenance_guard = MaintenanceGuardMiddleware()
    ban_guard = BanGuardMiddleware()
    access_guard = AccessCodeMiddleware()
    dp.message.middleware(maintenance_guard)
    dp.callback_query.middleware(maintenance_guard)
    dp.message.middleware(ban_guard)
    dp.callback_query.middleware(ban_guard)
    dp.message.middleware(access_guard)
    dp.callback_query.middleware(access_guard)

    dp.include_router(start.router)
    dp.include_router(lang.router)
    dp.include_router(shop.router)
    dp.include_router(support.router)
    dp.include_router(admin_auth.router)
    dp.include_router(admin_actions.router)
    dp.include_router(admin_commands.router)
    dp.include_router(affiliates.router)

    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
