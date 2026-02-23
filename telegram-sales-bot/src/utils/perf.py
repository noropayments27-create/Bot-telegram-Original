from __future__ import annotations

import contextvars
import logging
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
    _PERF_CTX.reset(token)

