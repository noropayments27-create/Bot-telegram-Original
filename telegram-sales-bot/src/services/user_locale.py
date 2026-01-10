import time
from typing import Optional

from .api_client import ApiClient

_CACHE = {}  # telegram_id -> (locale, ts)
_TTL = 300


def _fallback_from_tg(language_code: Optional[str]) -> str:
    lc = (language_code or "").lower()
    return "es" if lc.startswith("es") else "en"


async def get_user_locale(
    api_client: ApiClient, telegram_id: int, language_code: Optional[str]
) -> str:
    cached = _CACHE.get(telegram_id)
    if cached:
        locale, ts = cached
        if time.time() - ts < _TTL:
            return locale

    try:
        user_data = await api_client.get_user(telegram_id)
        locale = (user_data.get("user") or {}).get("locale", "").lower()
        if locale not in ("es", "en"):
            locale = _fallback_from_tg(language_code)
    except Exception:
        locale = _fallback_from_tg(language_code)

    _CACHE[telegram_id] = (locale, time.time())
    return locale


def invalidate_user_locale(telegram_id: int) -> None:
    _CACHE.pop(telegram_id, None)
