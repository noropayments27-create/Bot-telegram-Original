import time
import httpx

_CACHE = {}
_TTL = 60  # seconds


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


async def usd_to_btc_rate() -> float:
    key = "USD_BTC"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {"ids": "bitcoin", "vs_currencies": "usd"}
    async with httpx.AsyncClient(timeout=8) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        usd_per_btc = float(response.json()["bitcoin"]["usd"])
    btc_per_usd = 1.0 / usd_per_btc
    _cache_set(key, btc_per_usd)
    return btc_per_usd


async def usd_to_ltc_rate() -> float:
    key = "USD_LTC"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {"ids": "litecoin", "vs_currencies": "usd"}
    async with httpx.AsyncClient(timeout=8) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        usd_per_ltc = float(response.json()["litecoin"]["usd"])
    ltc_per_usd = 1.0 / usd_per_ltc
    _cache_set(key, ltc_per_usd)
    return ltc_per_usd
