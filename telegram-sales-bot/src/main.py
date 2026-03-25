import asyncio
import logging
import time
import traceback
from typing import Any

from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage

from .config import API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET, TELEGRAM_BOT_TOKEN
from .services.api_client import ApiClient
from .handlers import (
    admin_actions,
    admin_auth,
    admin_commands,
    affiliates,
    lang,
    publish_targets,
    start,
    shop,
    support,
    wallets,
)
from .middlewares.ban_guard import BanGuardMiddleware
from .middlewares.access_code import AccessCodeMiddleware
from .middlewares.maintenance_guard import MaintenanceGuardMiddleware
from .middlewares.perf_log import PerfLogMiddleware
from .middlewares.private_chat_guard import PrivateChatGuardMiddleware


_last_error_report_at: dict[str, float] = {}


def _should_report_error(key: str, cooldown_seconds: float = 30.0) -> bool:
    now = time.monotonic()
    last = float(_last_error_report_at.get(key, 0.0))
    if last > 0 and now - last < cooldown_seconds:
        return False
    _last_error_report_at[key] = now
    return True


async def _report_bot_error(
    message: str,
    *,
    code: str | None = None,
    route: str | None = None,
    stack: str | None = None,
    context: dict[str, Any] | None = None,
) -> None:
    if not message:
        return
    dedupe_key = f"{code or '-'}|{route or '-'}|{message[:120]}"
    if not _should_report_error(dedupe_key):
        return
    try:
        client = ApiClient(API_BASE_URL, token=API_TOKEN, bot_secret=BOT_TO_API_SECRET)
        await client.admin_report_app_error(
            "bot",
            message,
            code=code,
            route=route,
            stack=stack,
            context=context,
        )
    except Exception:
        logging.exception("bot_error_report_failed")


async def main() -> None:
    logging.basicConfig(level=logging.INFO)

    if not TELEGRAM_BOT_TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is required")

    bot = Bot(token=TELEGRAM_BOT_TOKEN)
    dp = Dispatcher(storage=MemoryStorage())

    maintenance_guard = MaintenanceGuardMiddleware()
    ban_guard = BanGuardMiddleware()
    access_guard = AccessCodeMiddleware()
    perf_log = PerfLogMiddleware()
    private_chat_guard = PrivateChatGuardMiddleware()
    dp.message.middleware(perf_log)
    dp.callback_query.middleware(perf_log)
    dp.message.middleware(private_chat_guard)
    dp.callback_query.middleware(private_chat_guard)
    dp.message.middleware(maintenance_guard)
    dp.callback_query.middleware(maintenance_guard)
    dp.message.middleware(ban_guard)
    dp.callback_query.middleware(ban_guard)
    dp.message.middleware(access_guard)
    dp.callback_query.middleware(access_guard)

    async def _dispatcher_error_handler(event: Any) -> None:
        exception = getattr(event, "exception", None)
        update = getattr(event, "update", None)
        if exception is None:
            return
        await _report_bot_error(
            str(exception),
            code=exception.__class__.__name__,
            route="dispatcher_update",
            stack="".join(
                traceback.format_exception(
                    type(exception),
                    exception,
                    exception.__traceback__,
                )
            ),
            context={
                "update_id": getattr(update, "update_id", None),
            },
        )

    if hasattr(dp, "errors") and hasattr(dp.errors, "register"):
        dp.errors.register(_dispatcher_error_handler)

    dp.include_router(start.router)
    dp.include_router(lang.router)
    dp.include_router(publish_targets.router)
    dp.include_router(shop.router)
    dp.include_router(wallets.router)
    dp.include_router(admin_auth.router)
    dp.include_router(admin_actions.router)
    dp.include_router(admin_commands.router)
    dp.include_router(support.router)
    dp.include_router(affiliates.router)

    loop = asyncio.get_running_loop()

    def _loop_exception_handler(_loop: asyncio.AbstractEventLoop, context: dict[str, Any]) -> None:
        exception = context.get("exception")
        message = str(context.get("message") or exception or "Async loop error")
        stack = None
        if exception is not None:
            stack = "".join(
                traceback.format_exception(
                    type(exception),
                    exception,
                    exception.__traceback__,
                )
            )
        task = context.get("task") or context.get("future")
        loop.create_task(
            _report_bot_error(
                message,
                code=exception.__class__.__name__ if exception is not None else "ASYNC_LOOP_ERROR",
                route="event_loop",
                stack=stack,
                context={
                    "task": repr(task) if task is not None else None,
                },
            )
        )
        loop.default_exception_handler(context)

    loop.set_exception_handler(_loop_exception_handler)

    try:
        await dp.start_polling(bot)
    except Exception as exc:
        await _report_bot_error(
            str(exc),
            code=exc.__class__.__name__,
            route="start_polling",
            stack="".join(
                traceback.format_exception(
                    type(exc),
                    exc,
                    exc.__traceback__,
                )
            ),
        )
        raise
    finally:
        await ApiClient.aclose_all()


if __name__ == "__main__":
    asyncio.run(main())
