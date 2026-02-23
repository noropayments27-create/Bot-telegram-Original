from __future__ import annotations

import contextvars
import logging
import math
import os
import time
from typing import Any, Dict, Optional

logger = logging.getLogger("bot.perf")

_ENABLED = str(os.getenv("BOT_PERF_LOG_ENABLED", "true")).strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
    "y",
}

_PERF_CTX: contextvars.ContextVar[Optional[Dict[str, Any]]] = contextvars.ContextVar(
    "bot_perf_ctx", default=None
)
_ROUTE_STATS: Dict[str, Dict[str, Any]] = {}
_EVENT_COUNTER = 0


def _parse_int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    try:
        value = int(str(raw).strip())
        return max(value, 1)
    except Exception:
        return default


_SUMMARY_EVERY_EVENTS = _parse_int_env("BOT_PERF_SUMMARY_EVERY_EVENTS", 50)
_SUMMARY_TOP_ROUTES = _parse_int_env("BOT_PERF_SUMMARY_TOP_ROUTES", 6)
_ROUTE_WINDOW_SIZE = _parse_int_env("BOT_PERF_ROUTE_WINDOW_SIZE", 200)


def is_perf_enabled() -> bool:
    return _ENABLED


def start_event(
    *,
    scope: str,
    user_id: int | None = None,
    update_type: str | None = None,
    route: str | None = None,
) -> contextvars.Token | None:
    if not _ENABLED:
        return None
    payload: Dict[str, Any] = {
        "scope": scope,
        "user_id": user_id,
        "update_type": update_type,
        "route": route,
        "started_at": time.perf_counter(),
        "api_calls": 0,
        "api_total_ms": 0.0,
        "api_methods": {},
    }
    return _PERF_CTX.set(payload)


def record_api_client_call(method_name: str, elapsed_ms: float, ok: bool) -> None:
    if not _ENABLED:
        return
    payload = _PERF_CTX.get()
    if not payload:
        return
    payload["api_calls"] = int(payload.get("api_calls", 0)) + 1
    payload["api_total_ms"] = float(payload.get("api_total_ms", 0.0)) + float(elapsed_ms)
    methods = payload.get("api_methods")
    if not isinstance(methods, dict):
        methods = {}
        payload["api_methods"] = methods
    method_slot = methods.get(method_name) or {"calls": 0, "errors": 0, "total_ms": 0.0}
    method_slot["calls"] += 1
    method_slot["total_ms"] += float(elapsed_ms)
    if not ok:
        method_slot["errors"] += 1
    methods[method_name] = method_slot


def _route_key(update_type: str | None, route: str | None) -> str:
    route_text = str(route or "-").strip() or "-"
    if len(route_text) > 72:
        route_text = route_text[:72]
    return f"{str(update_type or 'other')}:{route_text}"


def _q(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    idx = max(0, min(len(sorted_vals) - 1, int(math.ceil(q * len(sorted_vals))) - 1))
    return float(sorted_vals[idx])


def _update_route_stats(payload: Dict[str, Any], total_ms: float, status: str) -> None:
    global _EVENT_COUNTER
    route = _route_key(payload.get("update_type"), payload.get("route"))
    slot = _ROUTE_STATS.get(route)
    if not slot:
        slot = {
            "count": 0,
            "errors": 0,
            "total_ms": 0.0,
            "max_ms": 0.0,
            "api_calls": 0,
            "api_ms": 0.0,
            "samples": [],
        }
        _ROUTE_STATS[route] = slot
    slot["count"] += 1
    if status != "ok":
        slot["errors"] += 1
    slot["total_ms"] += total_ms
    slot["max_ms"] = max(float(slot["max_ms"]), total_ms)
    slot["api_calls"] += int(payload.get("api_calls", 0))
    slot["api_ms"] += float(payload.get("api_total_ms", 0.0))
    samples = slot.get("samples")
    if not isinstance(samples, list):
        samples = []
        slot["samples"] = samples
    samples.append(total_ms)
    if len(samples) > _ROUTE_WINDOW_SIZE:
        del samples[0 : len(samples) - _ROUTE_WINDOW_SIZE]
    _EVENT_COUNTER += 1


def _log_summary_if_needed() -> None:
    if _EVENT_COUNTER <= 0 or (_EVENT_COUNTER % _SUMMARY_EVERY_EVENTS) != 0:
        return
    ranked = sorted(
        _ROUTE_STATS.items(),
        key=lambda item: int(item[1].get("count", 0)),
        reverse=True,
    )[:_SUMMARY_TOP_ROUTES]
    if not ranked:
        return
    parts = []
    for route, slot in ranked:
        count = max(int(slot.get("count", 0)), 1)
        avg_ms = float(slot.get("total_ms", 0.0)) / count
        p95_ms = _q(slot.get("samples", []), 0.95)
        p99_ms = _q(slot.get("samples", []), 0.99)
        max_ms = float(slot.get("max_ms", 0.0))
        err = int(slot.get("errors", 0))
        api_avg_ms = float(slot.get("api_ms", 0.0)) / count
        api_avg_calls = float(slot.get("api_calls", 0)) / count
        parts.append(
            (
                f"{route}"
                f"|n={count}"
                f"|err={err}"
                f"|avg={avg_ms:.1f}ms"
                f"|p95={p95_ms:.1f}ms"
                f"|p99={p99_ms:.1f}ms"
                f"|max={max_ms:.1f}ms"
                f"|api_avg={api_avg_ms:.1f}ms/{api_avg_calls:.2f}"
            )
        )
    logger.info("perf_summary events=%s top=%s %s", _EVENT_COUNTER, len(parts), " || ".join(parts))


def finish_event(
    token: contextvars.Token | None,
    *,
    status: str = "ok",
    error: str | None = None,
) -> None:
    if not _ENABLED or token is None:
        return
    payload = _PERF_CTX.get()
    if isinstance(payload, dict):
        total_ms = (time.perf_counter() - float(payload.get("started_at", time.perf_counter()))) * 1000
        _update_route_stats(payload, total_ms, status)
        methods = payload.get("api_methods") if isinstance(payload.get("api_methods"), dict) else {}
        top_methods = sorted(
            methods.items(),
            key=lambda item: float(item[1].get("total_ms", 0.0)),
            reverse=True,
        )[:3]
        top_methods_text = ",".join(
            f"{name}:{slot.get('calls', 0)}:{int(float(slot.get('total_ms', 0.0)))}ms"
            for name, slot in top_methods
        ) or "-"
        logger.info(
            (
                "perf_event scope=%s update=%s route=%s user=%s status=%s "
                "total_ms=%.1f api_calls=%s api_ms=%.1f api_top=%s error=%s"
            ),
            payload.get("scope"),
            payload.get("update_type"),
            payload.get("route"),
            payload.get("user_id"),
            status,
            total_ms,
            payload.get("api_calls", 0),
            float(payload.get("api_total_ms", 0.0)),
            top_methods_text,
            (error or "-"),
        )
        _log_summary_if_needed()
    _PERF_CTX.reset(token)
