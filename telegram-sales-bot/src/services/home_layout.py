import time
from typing import Any, Dict

from .api_client import ApiClient

_CACHE_TTL_SECONDS = 5
_CACHE: Dict[str, Dict[str, Any]] = {}


def _cache_key(layout_key: str) -> str:
    return str(layout_key or "").strip().lower()


async def get_home_layout(
    api_client: ApiClient,
    layout_key: str,
) -> Dict[str, Any]:
    key = _cache_key(layout_key)
    now = time.time()
    slot = _CACHE.get(key) or {"fetched_at": 0.0, "data": {}}
    cached = slot.get("data") if isinstance(slot.get("data"), dict) else {}
    if cached and now - float(slot.get("fetched_at", 0.0)) < _CACHE_TTL_SECONDS:
        return cached
    try:
        response = await api_client.get_bot_layout(layout_key)
        layout = response.get("layout") if isinstance(response, dict) else {}
        if isinstance(layout, dict):
            _CACHE[key] = {"fetched_at": now, "data": layout}
            return layout
    except Exception:
        if cached:
            return cached
    return cached or {}


def clear_home_layout_cache(layout_key: str) -> None:
    key = _cache_key(layout_key)
    if key in _CACHE:
        _CACHE.pop(key, None)
