import os
from typing import Set

from dotenv import load_dotenv

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3001")
API_TOKEN = os.getenv("API_TOKEN")
BOT_TO_API_SECRET = os.getenv("BOT_TO_API_SECRET")
BOT_USERNAME = os.getenv("BOT_USERNAME")


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


BOT_RATE_LIMIT_ENABLED = _parse_bool(os.getenv("BOT_RATE_LIMIT_ENABLED"), True)
BOT_RATE_LIMIT_SECONDS = _parse_int(os.getenv("BOT_RATE_LIMIT_SECONDS"), 1)
BOT_RATE_LIMIT_SHOP_SECONDS = _parse_int(os.getenv("BOT_RATE_LIMIT_SHOP_SECONDS"), 1)
BOT_RATE_LIMIT_PAID_SECONDS = _parse_int(os.getenv("BOT_RATE_LIMIT_PAID_SECONDS"), 10)
BOT_RATE_LIMIT_SCREENSHOT_SECONDS = _parse_int(
    os.getenv("BOT_RATE_LIMIT_SCREENSHOT_SECONDS"), 15
)
BOT_RATE_LIMIT_SUPPORT_SECONDS = _parse_int(os.getenv("BOT_RATE_LIMIT_SUPPORT_SECONDS"), 3)
ADMIN_TELEGRAM_IDS = _parse_id_list(os.getenv("ADMIN_TELEGRAM_IDS", ""))
BOT_RATE_LIMIT_ADMIN_BYPASS_TELEGRAM_IDS = _parse_id_list(
    os.getenv("BOT_RATE_LIMIT_ADMIN_BYPASS_TELEGRAM_IDS", "")
)

BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS = ADMIN_TELEGRAM_IDS.union(
    BOT_RATE_LIMIT_ADMIN_BYPASS_TELEGRAM_IDS
)

NEQUI_NUMBER = "3009545964"
NEQUI_NAME = "Jos**** Mar**"
BINANCE_ID = "65088471"
CRYPTO_WALLET_USDT = os.getenv("CRYPTO_WALLET_USDT")
CRYPTO_WALLET_BTC = "15EedPYZDUXezTGoN9CSUfueFdRUm5yYGr"
CRYPTO_WALLET_LTC = "LM7pkJYTequoTAKMHodp6Z7yg4RTwNfSeY"
MERCADOPAGO_ACCOUNT = "CLABE: 722969013143608335"
PAYPAL_ACCOUNT = "Noropayments@gmail.com"
CRYPTO_WALLET_USDT_TRON = "TZFPjLa8j1FSXD95tY6x5pVZuCPWp5R8pn"
CRYPTO_WALLET_USDT_BSC = "0xa39b3bb9a576f9d4c11761fbef01d383fae3443d"
