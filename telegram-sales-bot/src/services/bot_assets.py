import time
from typing import Any, Dict

from .api_client import ApiClient

_CACHE_TTL_SECONDS = 60
_ASSET_CACHE: Dict[str, Any] = {
    "fetched_at": 0.0,
    "data": {},
}


def _normalize_value(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


async def get_bot_assets(api_client: ApiClient) -> Dict[str, Any]:
    now = time.time()
    cached = _ASSET_CACHE.get("data")
    if cached and now - float(_ASSET_CACHE.get("fetched_at", 0.0)) < _CACHE_TTL_SECONDS:
        return cached
    try:
        response = await api_client.get_bot_assets()
        assets = response.get("assets") if isinstance(response, dict) else {}
        if isinstance(assets, dict):
            _ASSET_CACHE["data"] = assets
            _ASSET_CACHE["fetched_at"] = now
            return assets
    except Exception:
        if cached:
            return cached
    return cached or {}


async def get_bot_asset_image(
    api_client: ApiClient, key: str, fallback: str | None = None
) -> str | None:
    assets = await get_bot_assets(api_client)
    value = _normalize_value(assets.get(key))
    if value:
        return value
    fallback_value = _normalize_value(fallback)
    return fallback_value or None
