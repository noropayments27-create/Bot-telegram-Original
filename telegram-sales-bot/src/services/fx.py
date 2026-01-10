import time
import httpx

_CACHE = {}
_TTL = 600  # seconds
_LAST_LOG = {}


def _cache_get(key):
    value = _CACHE.get(key)
    if not value:
        return None
    cached_value, ts = value
    if time.time() - ts > _TTL:
        return None
    return cached_value


def _cache_set(key, value):
    _CACHE[key] = (value, time.time())

def _log_once(key: str, msg: str) -> None:
    now = time.time()
    last = _LAST_LOG.get(key, 0)
    if now - last > 60:
        print(msg)
        _LAST_LOG[key] = now


def apply_markup(rate: float, markup: float = 0.02) -> float:
    return rate * (1.0 + markup)


async def usd_to(currency: str) -> float:
    currency = currency.upper()
    key = f"USD_{currency}"
    cached = _cache_get(key)
    if cached is not None:
        return cached

    url = "https://open.er-api.com/v6/latest/USD"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()

        rates = data.get("rates") or {}
        if currency not in rates:
            raise RuntimeError(f"rate_not_found:{currency}")

        rate = float(rates[currency])
        _cache_set(key, rate)
        return rate
    except Exception as exc:
        _log_once(key, f"[FX] primary failed {currency}: {repr(exc)}")

    fallback_url = "https://api.exchangerate.host/latest"
    params = {"base": "USD", "symbols": currency}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(fallback_url, params=params)
            response.raise_for_status()
            data = response.json()
        rates = data.get("rates") or {}
        if currency not in rates:
            raise RuntimeError(f"rate_not_found:{currency}")
        rate = float(rates[currency])
        _cache_set(key, rate)
        return rate
    except Exception as exc:
        _log_once(key, f"[FX] fallback failed {currency}: {repr(exc)}")
        raise


async def usd_to_cop() -> float:
    return await usd_to("COP")


async def usd_to_mxn() -> float:
    return await usd_to("MXN")
