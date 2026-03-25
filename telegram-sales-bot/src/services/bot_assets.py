import logging
import re
import time
from typing import Any, Dict
from urllib.parse import urljoin, urlparse

import httpx

from .api_client import ApiClient

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 15
_IMAGE_RESOLVE_TTL_SECONDS = 5 * 60
_MAX_HTML_BYTES = 256 * 1024
_ASSET_CACHE: Dict[str, Any] = {
    "fetched_at": 0.0,
    "data": {},
}
_IMAGE_URL_CACHE: Dict[str, Dict[str, Any]] = {}


def _normalize_value(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _extract_meta_image_url(html: str) -> str:
    if not html:
        return ""
    patterns = [
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
        r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\']',
    ]
    for pattern in patterns:
        match = re.search(pattern, html, flags=re.IGNORECASE)
        if match:
            candidate = _normalize_value(match.group(1))
            if candidate:
                return candidate
    return ""


def _is_http_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _cache_resolved_image_url(source: str, resolved: str) -> None:
    _IMAGE_URL_CACHE[source] = {
        "resolved": resolved,
        "expires_at": time.time() + _IMAGE_RESOLVE_TTL_SECONDS,
    }


def _get_cached_resolved_image_url(source: str) -> str:
    cached = _IMAGE_URL_CACHE.get(source) or {}
    expires_at = float(cached.get("expires_at", 0.0) or 0.0)
    if expires_at <= time.time():
        if source in _IMAGE_URL_CACHE:
            _IMAGE_URL_CACHE.pop(source, None)
        return ""
    return _normalize_value(cached.get("resolved"))


def _content_type_is_image(content_type: str) -> bool:
    return _normalize_value(content_type).lower().startswith("image/")


async def _resolve_image_url(value: str) -> str:
    source = _normalize_value(value)
    if not source or not _is_http_url(source):
        return source

    cached = _get_cached_resolved_image_url(source)
    if cached:
        return cached

    resolved = source
    try:
        async with httpx.AsyncClient(
            timeout=8.0,
            follow_redirects=True,
            headers={"User-Agent": "telegram-sales-bot/asset-resolver"},
        ) as client:
            head_response = None
            try:
                head_response = await client.head(source)
            except Exception:
                head_response = None

            if head_response is not None:
                if _content_type_is_image(head_response.headers.get("content-type", "")):
                    resolved = str(head_response.url)
                    _cache_resolved_image_url(source, resolved)
                    return resolved

            get_response = await client.get(
                source,
                headers={"Range": f"bytes=0-{_MAX_HTML_BYTES - 1}"},
            )
            content_type = _normalize_value(get_response.headers.get("content-type")).lower()
            if _content_type_is_image(content_type):
                resolved = str(get_response.url)
                _cache_resolved_image_url(source, resolved)
                return resolved

            if "text/html" in content_type:
                html_text = get_response.text[:_MAX_HTML_BYTES]
                meta_image = _extract_meta_image_url(html_text)
                if meta_image:
                    resolved = urljoin(str(get_response.url), meta_image)
                    logger.info(
                        "asset_image_resolved source=%s resolved=%s mode=meta",
                        source,
                        resolved,
                    )
                    _cache_resolved_image_url(source, resolved)
                    return resolved
                logger.warning(
                    "asset_image_not_direct source=%s content_type=%s",
                    source,
                    content_type or "-",
                )
    except Exception:
        resolved = source

    _cache_resolved_image_url(source, resolved)
    return resolved


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
    if key.endswith("_image_url"):
        file_id_key = f"{key[:-len('_image_url')]}_image_file_id"
        file_id = _normalize_value(assets.get(file_id_key))
        if file_id:
            return file_id
    value = _normalize_value(assets.get(key))
    if value:
        return await _resolve_image_url(value)
    fallback_value = _normalize_value(fallback)
    if fallback_value:
        return await _resolve_image_url(fallback_value)
    return None
