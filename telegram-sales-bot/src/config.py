import os
from typing import Set

from dotenv import load_dotenv

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3001")
API_TOKEN = os.getenv("API_TOKEN")
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY")
BOT_TO_API_SECRET = os.getenv("BOT_TO_API_SECRET")
BOT_USERNAME = os.getenv("BOT_USERNAME")
ADMIN_PANEL_LOCAL_URL = os.getenv("ADMIN_PANEL_LOCAL_URL", "http://localhost:3000")


def _parse_bool(value: str, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _parse_int(value: str, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _parse_id_list(value: str) -> Set[int]:
    if not value:
        return set()
    items = []
    for chunk in value.split(","):
        chunk = chunk.strip()
        if chunk.isdigit():
            items.append(int(chunk))
    return set(items)


BOT_UPDATE_MODE = os.getenv("BOT_UPDATE_MODE", "polling").strip().lower()
WEBHOOK_URL = os.getenv("WEBHOOK_URL", "").strip()
WEBHOOK_PATH = os.getenv("WEBHOOK_PATH", "/telegram/webhook").strip() or "/telegram/webhook"
WEBHOOK_HOST = os.getenv("WEBHOOK_HOST", "0.0.0.0").strip() or "0.0.0.0"
WEBHOOK_PORT = _parse_int(os.getenv("WEBHOOK_PORT"), 8080)
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "").strip()
BOT_RATE_LIMIT_ENABLED = _parse_bool(os.getenv("BOT_RATE_LIMIT_ENABLED"), True)
BOT_RATE_LIMIT_SECONDS = _parse_int(os.getenv("BOT_RATE_LIMIT_SECONDS"), 1)
BOT_RATE_LIMIT_SHOP_SECONDS = _parse_int(os.getenv("BOT_RATE_LIMIT_SHOP_SECONDS"), 1)
BOT_RATE_LIMIT_PAID_SECONDS = _parse_int(os.getenv("BOT_RATE_LIMIT_PAID_SECONDS"), 10)
BOT_RATE_LIMIT_SCREENSHOT_SECONDS = _parse_int(
    os.getenv("BOT_RATE_LIMIT_SCREENSHOT_SECONDS"), 15
)
BOT_RATE_LIMIT_SUPPORT_SECONDS = _parse_int(os.getenv("BOT_RATE_LIMIT_SUPPORT_SECONDS"), 3)
BOT_EARLY_CALLBACK_ANSWER_ENABLED = _parse_bool(
    os.getenv("BOT_EARLY_CALLBACK_ANSWER_ENABLED"),
    False,
)
PAYMENT_PROOF_SUBMIT_TIMEOUT_SECONDS = _parse_int(
    os.getenv("PAYMENT_PROOF_SUBMIT_TIMEOUT_SECONDS"), 90
)
ADMIN_TELEGRAM_IDS = _parse_id_list(os.getenv("ADMIN_TELEGRAM_IDS", ""))
BOT_RATE_LIMIT_ADMIN_BYPASS_TELEGRAM_IDS = _parse_id_list(
    os.getenv("BOT_RATE_LIMIT_ADMIN_BYPASS_TELEGRAM_IDS", "")
)

BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS = ADMIN_TELEGRAM_IDS.union(
    BOT_RATE_LIMIT_ADMIN_BYPASS_TELEGRAM_IDS
)

NEQUI_NUMBER = os.getenv("NEQUI_NUMBER")
NEQUI_NAME = os.getenv("NEQUI_NAME")
BINANCE_ID = os.getenv("BINANCE_ID")
CRYPTO_WALLET_USDT = os.getenv("CRYPTO_WALLET_USDT")
CRYPTO_WALLET_BTC = os.getenv("CRYPTO_WALLET_BTC")
CRYPTO_WALLET_LTC = os.getenv("CRYPTO_WALLET_LTC")
MERCADOPAGO_ACCOUNT = os.getenv("MERCADOPAGO_ACCOUNT")
PAYPAL_ACCOUNT = os.getenv("PAYPAL_ACCOUNT")
CRYPTO_WALLET_USDT_TRON = os.getenv("CRYPTO_WALLET_USDT_TRON")
CRYPTO_WALLET_USDT_BSC = os.getenv("CRYPTO_WALLET_USDT_BSC")
