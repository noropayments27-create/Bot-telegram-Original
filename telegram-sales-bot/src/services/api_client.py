from typing import Any, Dict, Optional

import asyncio
import inspect
import time
import re
from functools import wraps

import httpx
from ..config import ADMIN_API_KEY, PAYMENT_PROOF_SUBMIT_TIMEOUT_SECONDS
from ..utils.perf import record_api_client_call


async def _request_with_retry(fn, attempts: int = 3, delay: float = 0.35) -> Any:
    last_exc: Optional[Exception] = None
    for attempt in range(attempts):
        try:
            return await fn()
        except (httpx.TimeoutException, httpx.RequestError) as exc:
            last_exc = exc
            if attempt < attempts - 1:
                await asyncio.sleep(delay)
            else:
                raise
    if last_exc:
        raise last_exc
    raise RuntimeError("Retry failed without capturing an exception.")


class ApiClient:
    _shared_clients: Dict[str, httpx.AsyncClient] = {}
    _shared_cache: Dict[str, tuple[float, Any]] = {}

    def __init__(
        self,
        base_url: str,
        token: Optional[str] = None,
        bot_secret: Optional[str] = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.bot_secret = bot_secret

    def _headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if ADMIN_API_KEY:
            headers["x-admin-key"] = ADMIN_API_KEY
        if self.bot_secret:
            headers["x-bot-secret"] = self.bot_secret
        return headers

    def _client_key(self) -> str:
        return self.base_url

    def _client(self) -> httpx.AsyncClient:
        key = self._client_key()
        existing = self._shared_clients.get(key)
        if existing and not existing.is_closed:
            return existing
        client = httpx.AsyncClient()
        self._shared_clients[key] = client
        return client

    def _cache_key(self, scope: str, value: Any = None) -> str:
        suffix = "" if value is None else f":{value}"
        return f"{self.base_url}:{scope}{suffix}"

    def _cache_get(self, key: str) -> Any | None:
        cached = self._shared_cache.get(key)
        if not cached:
            return None
        expires_at, value = cached
        if expires_at <= time.monotonic():
            self._shared_cache.pop(key, None)
            return None
        return value

    def _cache_set(self, key: str, value: Any, ttl_seconds: float) -> Any:
        self._shared_cache[key] = (time.monotonic() + max(ttl_seconds, 0), value)
        return value

    def _cache_pop(self, key: str) -> None:
        self._shared_cache.pop(key, None)

    async def _request(
        self,
        method: str,
        url: str,
        *,
        retry: bool = False,
        **kwargs,
    ) -> httpx.Response:
        client = self._client()

        async def _do() -> httpx.Response:
            return await client.request(method, url, **kwargs)

        if retry:
            return await _request_with_retry(_do)
        return await _do()

    @classmethod
    async def aclose_all(cls) -> None:
        clients = list(cls._shared_clients.values())
        cls._shared_clients.clear()
        for client in clients:
            if client and not client.is_closed:
                await client.aclose()

    async def ping_health(self) -> Dict[str, Any]:
        url = f"{self.base_url}/health"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self._headers(), timeout=5)
            response.raise_for_status()
            return response.json()

    async def upsert_telegram_user(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/users/telegram/upsert"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json=payload, headers=self._headers(), timeout=5
            )
            if response.status_code == 403:
                return {"status_code": 403, "data": response.json()}
            response.raise_for_status()
            return {"status_code": response.status_code, "data": response.json()}

    async def list_products(
        self,
        page: int = 1,
        page_size: int = 8,
        telegram_id: int | None = None,
        category_key: str | None = None,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/products"
        params: Dict[str, Any] = {
            "active": "true",
            "page": page,
            "page_size": page_size,
        }
        if telegram_id is not None:
            params["telegram_id"] = telegram_id
        if category_key:
            params["category_key"] = category_key
        response = await self._request(
            "GET",
            url,
            params=params,
            headers=self._headers(),
            timeout=5,
        )
        response.raise_for_status()
        return response.json()

    async def create_order(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/orders"
        response = await self._request(
            "POST",
            url,
            json=payload,
            headers=self._headers(),
            timeout=5,
        )
        if response.status_code == 409:
            return {"status_code": 409, "data": response.json()}
        response.raise_for_status()
        return response.json()

    async def submit_payment_proof(self, order_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/orders/{order_id}/payment-proof"
        response = await self._request(
            "POST",
            url,
            json=payload,
            headers=self._headers(),
            timeout=PAYMENT_PROOF_SUBMIT_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()

    async def pay_order_with_wallet(self, order_id: str, telegram_id: int) -> Dict[str, Any]:
        url = f"{self.base_url}/orders/{order_id}/pay-with-wallet"
        response = await self._request(
            "POST",
            url,
            json={"telegram_id": telegram_id},
            headers=self._headers(),
            timeout=60,
        )
        if response.status_code == 409:
            return {"status_code": 409, "data": response.json()}
        response.raise_for_status()
        self._cache_pop(self._cache_key("wallet", telegram_id))
        return response.json()

    async def admin_get_maintenance(self) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/maintenance"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self._headers(), timeout=10)
            response.raise_for_status()
            return response.json()

    async def admin_auth_direct(self, password: str) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/auth/direct"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json={"password": password},
                headers={"Content-Type": "application/json"},
                timeout=15,
            )
            response.raise_for_status()
            return response.json()

    async def admin_set_maintenance(
        self, active: bool, message: Optional[str] = None
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/maintenance"
        payload: Dict[str, Any] = {"active": bool(active)}
        if message:
            payload["message"] = message
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json=payload, headers=self._headers(), timeout=15
            )
            response.raise_for_status()
            return response.json()

    async def admin_list_orders(
        self, status: str = "WAITING_PAYMENT", page: int = 1, page_size: int = 10
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/orders"
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                params={"status": status, "page": page, "page_size": page_size},
                headers=self._headers(),
                timeout=15,
            )
            response.raise_for_status()
            return response.json()

    async def admin_get_order_status_counts(self) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/orders/status-counts"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self._headers(), timeout=10)
            response.raise_for_status()
            return response.json()

    async def admin_get_summary(self) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/summary"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self._headers(), timeout=10)
            response.raise_for_status()
            return response.json()

    async def admin_list_users(
        self,
        page: int = 1,
        page_size: int = 30,
        refresh: bool = False,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/users"
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                params={
                    "page": page,
                    "page_size": page_size,
                    "refresh": "1" if refresh else "0",
                },
                headers=self._headers(),
                timeout=30 if refresh else 10,
            )
            response.raise_for_status()
            return response.json()

    async def admin_list_notification_blocks(
        self,
        page: int = 1,
        page_size: int = 30,
        refresh: bool = False,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/users/notification-blocks"
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                params={
                    "page": page,
                    "page_size": page_size,
                    "refresh": "1" if refresh else "0",
                },
                headers=self._headers(),
                timeout=30 if refresh else 10,
            )
            response.raise_for_status()
            return response.json()

    async def admin_get_order(self, order_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/orders/{order_id}"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self._headers(), timeout=15)
            response.raise_for_status()
            return response.json()

    async def admin_mark_order_paid(self, order_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/orders/{order_id}/mark-paid"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json={}, headers=self._headers(), timeout=60
            )
            response.raise_for_status()
            return response.json()

    async def admin_reject_order(
        self, order_id: str, mode: str = "retry", reason: Optional[str] = None
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/orders/{order_id}/reject"
        payload: Dict[str, Any] = {"mode": mode}
        if reason:
            payload["reason"] = reason
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json=payload, headers=self._headers(), timeout=30
            )
            response.raise_for_status()
            return response.json()

    async def admin_cancel_order(
        self, order_id: str, reason: Optional[str] = None
    ) -> Dict[str, Any]:
        return await self.admin_reject_order(order_id, mode="cancel", reason=reason)

    async def admin_mark_order_scam(
        self, order_id: str, reason: Optional[str] = None
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/orders/{order_id}/scam"
        payload: Dict[str, Any] = {}
        if reason:
            payload["reason"] = reason
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json=payload, headers=self._headers(), timeout=30
            )
            response.raise_for_status()
            return response.json()

    async def admin_create_test_order(
        self, telegram_id: int, username: Optional[str] = None
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/orders/test"
        payload: Dict[str, Any] = {"telegram_id": telegram_id}
        if username:
            payload["username"] = username
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json=payload, headers=self._headers(), timeout=30
            )
            response.raise_for_status()
            return response.json()

    async def admin_refund_order(
        self, order_id: str, reason: Optional[str] = None, amount: Optional[float] = None
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/orders/{order_id}/refund"
        payload: Dict[str, Any] = {}
        if reason:
            payload["reason"] = reason
        if amount is not None:
            payload["amount"] = amount
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json=payload, headers=self._headers(), timeout=60
            )
            response.raise_for_status()
            return response.json()

    async def admin_toggle_ban(self, telegram_id: int) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/users/{telegram_id}/ban-toggle"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json={}, headers=self._headers(), timeout=15
            )
            response.raise_for_status()
            return response.json()

    async def admin_create_broadcast(
        self,
        message: str,
        segment: str = "ALL_USERS",
        buttons: Optional[list[Dict[str, str]]] = None,
        media_file_id: Optional[str] = None,
        media_kind: Optional[str] = None,
        message_entities: Optional[list[Dict[str, Any]]] = None,
        saved_kind: Optional[str] = None,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/broadcasts"
        payload: Dict[str, Any] = {"message": message, "segment": segment}
        if buttons is not None:
            payload["buttons"] = buttons
        if media_file_id:
            payload["media_file_id"] = media_file_id
        if media_kind:
            payload["media_kind"] = media_kind
        if message_entities is not None:
            payload["message_entities"] = message_entities
        if saved_kind:
            payload["saved_kind"] = saved_kind
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json=payload, headers=self._headers(), timeout=30
            )
            response.raise_for_status()
            return response.json()

    async def admin_list_broadcasts(self, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/broadcasts"
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                params={"page": page, "page_size": page_size},
                headers=self._headers(),
                timeout=20,
            )
            response.raise_for_status()
            return response.json()

    async def admin_get_broadcast(self, broadcast_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/broadcasts/{broadcast_id}"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self._headers(), timeout=20)
            response.raise_for_status()
            return response.json()

    async def admin_update_broadcast(
        self,
        broadcast_id: str,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/broadcasts/{broadcast_id}"
        async with httpx.AsyncClient() as client:
            response = await client.patch(
                url, json=payload, headers=self._headers(), timeout=30
            )
            response.raise_for_status()
            return response.json()

    async def admin_delete_broadcast(self, broadcast_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/broadcasts/{broadcast_id}"
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                url, headers=self._headers(), timeout=20
            )
            response.raise_for_status()
            return response.json()

    async def admin_send_broadcast(self, broadcast_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/broadcasts/{broadcast_id}/send"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json={}, headers=self._headers(), timeout=180
            )
            response.raise_for_status()
            return response.json()

    async def admin_send_broadcast_async(self, broadcast_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/broadcasts/{broadcast_id}/send"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json={"async": True}, headers=self._headers(), timeout=30
            )
            response.raise_for_status()
            return response.json()

    async def admin_get_broadcast_progress(self, broadcast_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/broadcasts/{broadcast_id}/progress"
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url, headers=self._headers(), timeout=20
            )
            response.raise_for_status()
            return response.json()

    async def admin_pause_broadcast(self, broadcast_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/broadcasts/{broadcast_id}/pause"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json={}, headers=self._headers(), timeout=20
            )
            response.raise_for_status()
            return response.json()

    async def admin_resume_broadcast(self, broadcast_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/broadcasts/{broadcast_id}/resume"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json={}, headers=self._headers(), timeout=20
            )
            response.raise_for_status()
            return response.json()

    async def admin_stop_broadcast(self, broadcast_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/broadcasts/{broadcast_id}/stop"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json={}, headers=self._headers(), timeout=20
            )
            response.raise_for_status()
            return response.json()

    async def admin_list_publish_targets(
        self,
        *,
        scope: str = "all",
        include_inactive: bool = False,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/publish-targets"
        params: Dict[str, Any] = {"scope": scope}
        if include_inactive:
            params["include_inactive"] = 1
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                params=params,
                headers=self._headers(),
                timeout=20,
            )
            response.raise_for_status()
            return response.json()

    async def admin_send_publication(
        self,
        *,
        scope: str = "all",
        message: str,
        buttons: Optional[list[Dict[str, str]]] = None,
        media_file_id: Optional[str] = None,
        media_kind: Optional[str] = None,
        message_entities: Optional[list[Dict[str, Any]]] = None,
        chat_ids: Optional[list[int | str]] = None,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/publications/send"
        payload: Dict[str, Any] = {
            "scope": scope,
            "message": message,
        }
        if buttons is not None:
            payload["buttons"] = buttons
        if media_file_id:
            payload["media_file_id"] = media_file_id
        if media_kind:
            payload["media_kind"] = media_kind
        if message_entities is not None:
            payload["message_entities"] = message_entities
        if chat_ids:
            payload["chat_ids"] = chat_ids
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json=payload,
                headers=self._headers(),
                timeout=180,
            )
            response.raise_for_status()
            return response.json()

    async def admin_create_publication(
        self,
        *,
        message: str,
        buttons: Optional[list[Dict[str, str]]] = None,
        media_file_id: Optional[str] = None,
        media_kind: Optional[str] = None,
        message_entities: Optional[list[Dict[str, Any]]] = None,
        saved_kind: Optional[str] = None,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/publications"
        payload: Dict[str, Any] = {"message": message}
        if buttons is not None:
            payload["buttons"] = buttons
        if media_file_id:
            payload["media_file_id"] = media_file_id
        if media_kind:
            payload["media_kind"] = media_kind
        if message_entities is not None:
            payload["message_entities"] = message_entities
        if saved_kind:
            payload["saved_kind"] = saved_kind
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json=payload,
                headers=self._headers(),
                timeout=30,
            )
            response.raise_for_status()
            return response.json()

    async def admin_list_publications(self, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/publications"
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                params={"page": page, "page_size": page_size},
                headers=self._headers(),
                timeout=20,
            )
            response.raise_for_status()
            return response.json()

    async def admin_get_publication(self, publication_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/publications/{publication_id}"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self._headers(), timeout=20)
            response.raise_for_status()
            return response.json()

    async def admin_update_publication(
        self,
        publication_id: str,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/publications/{publication_id}"
        async with httpx.AsyncClient() as client:
            response = await client.patch(
                url,
                json=payload,
                headers=self._headers(),
                timeout=30,
            )
            response.raise_for_status()
            return response.json()

    async def admin_delete_publication(self, publication_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/publications/{publication_id}"
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                url,
                headers=self._headers(),
                timeout=20,
            )
            response.raise_for_status()
            return response.json()

    async def admin_send_saved_publication(
        self,
        publication_id: str,
        *,
        scope: str = "all",
        chat_ids: Optional[list[int | str]] = None,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/publications/{publication_id}/send"
        payload: Dict[str, Any] = {"scope": scope}
        if chat_ids:
            payload["chat_ids"] = chat_ids
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json=payload,
                headers=self._headers(),
                timeout=180,
            )
            response.raise_for_status()
            return response.json()

    async def admin_get_logs(self, category: str, limit: int = 10) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/logs"
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                params={"category": category, "limit": limit},
                headers=self._headers(),
                timeout=20,
            )
            response.raise_for_status()
            return response.json()

    async def admin_report_app_error(
        self,
        source: str,
        message: str,
        *,
        level: str = "error",
        code: str | None = None,
        route: str | None = None,
        stack: str | None = None,
        context: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/app-errors"
        payload: Dict[str, Any] = {
            "source": source,
            "level": level,
            "message": message,
        }
        if code:
            payload["code"] = code
        if route:
            payload["route"] = route
        if stack:
            payload["stack"] = stack
        if context:
            payload["context"] = context
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json=payload,
                headers=self._headers(),
                timeout=10,
            )
            response.raise_for_status()
            return response.json()

    async def admin_list_wallet_topups(
        self,
        status: str = "SUBMITTED",
        page: int = 1,
        page_size: int = 10,
        include_all: bool = False,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/wallets/topups"
        response = await self._request(
            "GET",
            url,
            params={
                "status": status,
                "page": page,
                "page_size": page_size,
                "include_all": "1" if include_all else "0",
            },
            headers=self._headers(),
            timeout=20,
        )
        response.raise_for_status()
        return response.json()

    async def admin_get_wallet_topup(self, ref: str) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/wallets/topups/{ref}"
        response = await self._request(
            "GET",
            url,
            headers=self._headers(),
            timeout=20,
        )
        response.raise_for_status()
        return response.json()

    async def admin_approve_wallet_topup(self, ref: str) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/wallets/topups/{ref}/approve"
        response = await self._request(
            "POST",
            url,
            json={},
            headers=self._headers(),
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()
        telegram_id = (data.get("topup") or {}).get("telegram_id")
        if telegram_id is not None:
            self._cache_pop(self._cache_key("wallet", telegram_id))
        return data

    async def admin_reject_wallet_topup(self, ref: str, reason: str | None = None) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/wallets/topups/{ref}/reject"
        payload: Dict[str, Any] = {}
        if reason:
            payload["reason"] = reason
        response = await self._request(
            "POST",
            url,
            json=payload,
            headers=self._headers(),
            timeout=20,
        )
        response.raise_for_status()
        return response.json()

    async def admin_scam_wallet_topup(self, ref: str, reason: str | None = None) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/wallets/topups/{ref}/scam"
        payload: Dict[str, Any] = {}
        if reason:
            payload["reason"] = reason
        response = await self._request(
            "POST",
            url,
            json=payload,
            headers=self._headers(),
            timeout=20,
        )
        response.raise_for_status()
        return response.json()

    async def admin_list_wallet_gifts(
        self,
        *,
        status: str | None = None,
        source_kind: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/wallet-gifts"
        params: Dict[str, Any] = {"page": page, "page_size": page_size}
        if status:
            params["status"] = status
        if source_kind:
            params["source_kind"] = source_kind
        response = await self._request(
            "GET",
            url,
            params=params,
            headers=self._headers(),
            timeout=20,
        )
        response.raise_for_status()
        return response.json()

    async def admin_get_wallet_gift(self, gift_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/wallet-gifts/{gift_id}"
        response = await self._request(
            "GET",
            url,
            headers=self._headers(),
            timeout=20,
        )
        response.raise_for_status()
        return response.json()

    async def admin_get_wallet_user(self, lookup: str | int, limit: int = 20) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/wallets/users/{lookup}"
        response = await self._request(
            "GET",
            url,
            params={"limit": limit},
            headers=self._headers(),
            timeout=20,
        )
        response.raise_for_status()
        return response.json()

    async def admin_adjust_wallet(
        self,
        telegram_id: int,
        amount: float,
        reason: str | None = None,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/wallets/users/{telegram_id}/adjust"
        payload: Dict[str, Any] = {"amount": amount}
        if reason is not None:
            payload["reason"] = reason
        response = await self._request(
            "POST",
            url,
            json=payload,
            headers=self._headers(),
            timeout=20,
        )
        if response.status_code == 409:
            return {"status_code": 409, "data": response.json()}
        response.raise_for_status()
        self._cache_pop(self._cache_key("wallet", telegram_id))
        return response.json()

    async def admin_get_sales_insights(
        self,
        month_offset: int = 0,
        week_offset: int = 0,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/stats/sales-insights"
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                params={"month_offset": month_offset, "week_offset": week_offset},
                headers=self._headers(),
                timeout=20,
            )
            response.raise_for_status()
            return response.json()

    async def admin_get_top_products_month(
        self,
        limit: int = 5,
        month_offset: int = 0,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/stats/top-products-month"
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                params={"limit": limit, "month_offset": month_offset},
                headers=self._headers(),
                timeout=20,
            )
            response.raise_for_status()
            return response.json()

    async def admin_download_sales_export_csv(
        self,
        period: str,
        month_offset: int = 0,
        week_offset: int = 0,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/stats/sales-export.csv"
        normalized_period = "week" if str(period).lower() == "week" else "month"
        response = await self._request(
            "GET",
            url,
            params={
                "period": normalized_period,
                "month_offset": month_offset,
                "week_offset": week_offset,
            },
            headers=self._headers(),
            timeout=30,
        )
        if response.status_code in (404, 409):
            try:
                data = response.json()
            except ValueError:
                data = {}
            return {"status_code": response.status_code, "data": data}
        response.raise_for_status()
        disposition = response.headers.get("content-disposition") or ""
        filename_match = re.search(r'filename="([^"]+)"', disposition)
        filename = (
            filename_match.group(1)
            if filename_match
            else f"ganancias-{normalized_period}.csv"
        )
        return {"status_code": response.status_code, "filename": filename, "content": response.content}

    async def admin_download_sales_export_xlsx(
        self,
        period: str,
        month_offset: int = 0,
        week_offset: int = 0,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/stats/sales-export.xlsx"
        normalized_period = "week" if str(period).lower() == "week" else "month"
        response = await self._request(
            "GET",
            url,
            params={
                "period": normalized_period,
                "month_offset": month_offset,
                "week_offset": week_offset,
            },
            headers=self._headers(),
            timeout=30,
        )
        if response.status_code in (404, 409):
            try:
                data = response.json()
            except ValueError:
                data = {}
            return {"status_code": response.status_code, "data": data}
        response.raise_for_status()
        disposition = response.headers.get("content-disposition") or ""
        filename_match = re.search(r'filename="([^"]+)"', disposition)
        filename = (
            filename_match.group(1)
            if filename_match
            else f"ganancias-{normalized_period}.xlsx"
        )
        return {"status_code": response.status_code, "filename": filename, "content": response.content}

    async def admin_create_product(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/products"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json=payload,
                headers=self._headers(),
                timeout=30,
            )
            response.raise_for_status()
            return response.json()

    async def admin_deactivate_product(self, product_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/products/{product_id}/deactivate"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json={},
                headers=self._headers(),
                timeout=20,
            )
            response.raise_for_status()
            return response.json()

    async def admin_recalculate_products(self) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/products/recalculate"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json={},
                headers=self._headers(),
                timeout=30,
            )
            response.raise_for_status()
            return response.json()

    async def get_order(self, order_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/orders/{order_id}"
        response = await self._request(
            "GET", url, headers=self._headers(), timeout=5
        )
        response.raise_for_status()
        return response.json()

    async def get_payment_methods(self) -> Dict[str, Any]:
        cache_key = self._cache_key("payment_methods")
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached
        url = f"{self.base_url}/orders/payment-methods"
        response = await self._request(
            "GET", url, headers=self._headers(), timeout=5
        )
        response.raise_for_status()
        return self._cache_set(cache_key, response.json(), 30)

    async def get_user(self, telegram_id: int) -> Dict[str, Any]:
        cache_key = self._cache_key("user", telegram_id)
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached
        url = f"{self.base_url}/users/{telegram_id}"

        async def _do() -> Dict[str, Any]:
            response = await self._request(
                "GET",
                url,
                headers=self._headers(),
                timeout=15,
            )
            response.raise_for_status()
            return response.json()

        result = await _request_with_retry(_do)
        return self._cache_set(cache_key, result, 15)

    async def get_wallet(self, telegram_id: int) -> Dict[str, Any]:
        cache_key = self._cache_key("wallet", telegram_id)
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached
        url = f"{self.base_url}/users/{telegram_id}/wallet"
        response = await self._request(
            "GET",
            url,
            headers=self._headers(),
            timeout=15,
        )
        response.raise_for_status()
        return self._cache_set(cache_key, response.json(), 8)

    async def get_wallet_history(self, telegram_id: int, limit: int = 10) -> Dict[str, Any]:
        url = f"{self.base_url}/users/{telegram_id}/wallet/history"
        response = await self._request(
            "GET",
            url,
            params={"limit": limit},
            headers=self._headers(),
            timeout=15,
        )
        response.raise_for_status()
        return response.json()

    async def create_wallet_topup(self, telegram_id: int, amount_usd: float) -> Dict[str, Any]:
        url = f"{self.base_url}/users/{telegram_id}/wallet/topups"
        response = await self._request(
            "POST",
            url,
            json={"amount_usd": amount_usd},
            headers=self._headers(),
            timeout=20,
        )
        if response.status_code == 400:
            return {"status_code": 400, "data": response.json()}
        response.raise_for_status()
        return response.json()

    async def get_wallet_topup(self, ref: str, telegram_id: int) -> Dict[str, Any]:
        url = f"{self.base_url}/users/wallet-topups/{ref}"
        response = await self._request(
            "GET",
            url,
            params={"telegram_id": telegram_id},
            headers=self._headers(),
            timeout=15,
        )
        response.raise_for_status()
        return response.json()

    async def submit_wallet_topup_proof(self, ref: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/users/wallet-topups/{ref}/payment-proof"
        response = await self._request(
            "POST",
            url,
            json=payload,
            headers=self._headers(),
            timeout=PAYMENT_PROOF_SUBMIT_TIMEOUT_SECONDS,
        )
        if response.status_code in (403, 409, 422):
            return {"status_code": response.status_code, "data": response.json()}
        response.raise_for_status()
        return response.json()

    async def claim_wallet_gift(self, telegram_id: int, claim_token: str) -> Dict[str, Any]:
        url = f"{self.base_url}/users/wallet-gifts/claim"
        response = await self._request(
            "POST",
            url,
            json={"telegram_id": telegram_id, "claim_token": claim_token},
            headers=self._headers(),
            timeout=30,
        )
        if response.status_code in (404, 409):
            return {"status_code": response.status_code, "data": response.json()}
        response.raise_for_status()
        self._cache_pop(self._cache_key("wallet", telegram_id))
        return response.json()

    async def admin_get_layout(self, key: str) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/layouts/{key}"

        async def _do() -> Dict[str, Any]:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url, headers=self._headers(), timeout=15
                )
                response.raise_for_status()
                return response.json()

        return await _request_with_retry(_do)

    async def admin_set_layout(self, key: str, layout: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/layouts/{key}"

        async def _do() -> Dict[str, Any]:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    json=layout,
                    headers=self._headers(),
                    timeout=20,
                )
                response.raise_for_status()
                return response.json()

        return await _request_with_retry(_do)

    async def admin_get_bot_assets(self) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/bot-assets"

        async def _do() -> Dict[str, Any]:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url,
                    headers=self._headers(),
                    timeout=15,
                )
                response.raise_for_status()
                return response.json()

        return await _request_with_retry(_do)

    async def admin_set_bot_assets(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/bot-assets"

        async def _do() -> Dict[str, Any]:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers=self._headers(),
                    timeout=20,
                )
                response.raise_for_status()
                return response.json()

        self._cache_pop(self._cache_key("bot_assets"))
        return await _request_with_retry(_do)

    async def get_ban_status(self, telegram_id: int) -> Dict[str, Any]:
        cache_key = self._cache_key("ban", telegram_id)
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached
        url = f"{self.base_url}/users/{telegram_id}/ban"

        async def _do() -> Dict[str, Any]:
            response = await self._request(
                "GET",
                url,
                headers=self._headers(),
                timeout=10,
            )
            response.raise_for_status()
            return response.json()

        result = await _request_with_retry(_do)
        return self._cache_set(cache_key, result, 8)

    async def get_maintenance_status(self) -> Dict[str, Any]:
        cache_key = self._cache_key("maintenance")
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached
        url = f"{self.base_url}/bot/maintenance"

        async def _do() -> Dict[str, Any]:
            response = await self._request(
                "GET",
                url,
                headers=self._headers(),
                timeout=10,
            )
            response.raise_for_status()
            return response.json()

        result = await _request_with_retry(_do)
        return self._cache_set(cache_key, result, 5)

    async def get_access_status(self) -> Dict[str, Any]:
        cache_key = self._cache_key("access")
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached
        url = f"{self.base_url}/bot/access"

        async def _do() -> Dict[str, Any]:
            response = await self._request(
                "GET",
                url,
                headers=self._headers(),
                timeout=5,
                retry=True,
            )
            response.raise_for_status()
            return response.json()

        result = await _request_with_retry(_do)
        return self._cache_set(cache_key, result, 5)

    async def get_bot_assets(self) -> Dict[str, Any]:
        cache_key = self._cache_key("bot_assets")
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached
        url = f"{self.base_url}/bot/assets"

        async def _do() -> Dict[str, Any]:
            response = await self._request(
                "GET",
                url,
                headers=self._headers(),
                timeout=10,
            )
            response.raise_for_status()
            return response.json()

        result = await _request_with_retry(_do)
        return self._cache_set(cache_key, result, 30)

    async def get_bot_layout(self, key: str) -> Dict[str, Any]:
        cache_key = self._cache_key("bot_layout", key)
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached
        url = f"{self.base_url}/bot/layouts/{key}"

        async def _do() -> Dict[str, Any]:
            response = await self._request(
                "GET",
                url,
                headers=self._headers(),
                timeout=10,
            )
            response.raise_for_status()
            return response.json()

        result = await _request_with_retry(_do)
        return self._cache_set(cache_key, result, 30)

    async def bot_register_publish_target(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/bot/publish-targets/register"
        response = await self._request(
            "POST",
            url,
            json=payload,
            headers=self._headers(),
            timeout=15,
            retry=True,
        )
        response.raise_for_status()
        return response.json()

    async def get_affiliate_top(
        self, telegram_id: int, period: str = "week"
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/users/affiliates/top"
        async def _do() -> Dict[str, Any]:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url,
                    params={"telegram_id": telegram_id, "period": period},
                    headers=self._headers(),
                    timeout=15,
                )
                response.raise_for_status()
                return response.json()

        return await _request_with_retry(_do)

    async def request_affiliate_withdraw(
        self, telegram_id: int, amount: float | None = None
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/users/affiliates/withdraw"
        payload = {"telegram_id": telegram_id}
        if amount is not None:
            payload["amount"] = amount
        async def _do() -> Dict[str, Any]:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers=self._headers(),
                    timeout=15,
                )
                if response.status_code >= 400:
                    try:
                        return {
                            "status_code": response.status_code,
                            "data": response.json(),
                        }
                    except ValueError:
                        return {"status_code": response.status_code, "data": {}}
                return response.json()

        return await _request_with_retry(_do)

    async def decide_affiliate(self, affiliate_id: str, status: str) -> Dict[str, Any]:
        url = f"{self.base_url}/users/affiliates/{affiliate_id}/decision"
        payload = {"status": status}

        async def _do() -> Dict[str, Any]:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers=self._headers(),
                    timeout=15,
                )
                response.raise_for_status()
                return response.json()

        return await _request_with_retry(_do)

    async def set_user_locale(self, telegram_id: int, locale: str) -> Dict[str, Any]:
        url = f"{self.base_url}/users/{telegram_id}/locale"
        payload = {"locale": locale}

        async def _do() -> Dict[str, Any]:
            async with httpx.AsyncClient() as client:
                response = await client.patch(
                    url, json=payload, headers=self._headers(), timeout=15
                )
                response.raise_for_status()
                return response.json()

        return await _request_with_retry(_do)

    async def get_cart(self, telegram_id: int) -> Dict[str, Any]:
        url = f"{self.base_url}/bot/cart"
        async def _do() -> Dict[str, Any]:
            response = await self._request(
                "GET",
                url,
                params={"telegram_id": telegram_id},
                headers=self._headers(),
                timeout=15,
            )
            response.raise_for_status()
            return response.json()

        return await _request_with_retry(_do)

    async def add_to_cart(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/bot/cart/add"
        async def _do() -> Dict[str, Any]:
            response = await self._request(
                "POST",
                url,
                json=payload,
                headers=self._headers(),
                timeout=15,
            )
            if response.status_code == 409:
                try:
                    data = response.json()
                except ValueError:
                    data = {}
                return data if isinstance(data, dict) else {"ok": False}
            if response.status_code in (200, 201):
                return response.json()
            response.raise_for_status()
            return response.json()

        return await _request_with_retry(_do)

    async def clear_cart(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/bot/cart/clear"
        response = await self._request(
            "POST",
            url,
            json=payload,
            headers=self._headers(),
            timeout=15,
        )
        response.raise_for_status()
        return response.json()

    async def checkout_cart(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/bot/cart/checkout"
        response = await self._request(
            "POST",
            url,
            json=payload,
            headers=self._headers(),
            timeout=15,
        )
        if response.status_code == 409:
            try:
                data = response.json()
            except ValueError:
                data = {}
            return data if isinstance(data, dict) else {"ok": False}
        if response.status_code in (200, 201):
            return response.json()
        response.raise_for_status()
        return response.json()

    async def open_or_create_ticket(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/tickets/open-or-create"
        response = await self._request(
            "POST",
            url,
            json=payload,
            headers=self._headers(),
            timeout=5,
        )
        if response.status_code in (400, 403, 409):
            return {"status_code": response.status_code, "data": response.json()}
        response.raise_for_status()
        return {"status_code": response.status_code, "data": response.json()}

    async def get_affiliate_status(self, telegram_id: int) -> Dict[str, Any]:
        url = f"{self.base_url}/users/affiliates/status"
        response = await self._request(
            "GET",
            url,
            params={"telegram_id": telegram_id},
            headers=self._headers(),
            timeout=10,
        )
        response.raise_for_status()
        return response.json()

    async def apply_affiliate(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/users/affiliates/apply"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json=payload, headers=self._headers(), timeout=10
            )
            try:
                data = response.json()
            except ValueError:
                data = {}
            if response.status_code in (200, 201):
                return data
            return {
                "error": data.get("error") if isinstance(data, dict) else None,
                "status_code": response.status_code,
            }

    async def assign_affiliate_code(
        self, payload: Dict[str, Any], bot_secret: Optional[str]
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/users/affiliates/code/assign"
        headers = {"x-bot-secret": bot_secret} if bot_secret else {}
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers, timeout=10)
            try:
                data = response.json()
            except ValueError:
                data = {}
            if response.status_code >= 400:
                return {"status_code": response.status_code, "data": data}
            return {"status_code": response.status_code, "data": data}

    async def send_ticket_message(
        self, ticket_id: str, payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/tickets/{ticket_id}/message"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json=payload, headers=self._headers(), timeout=5
            )
            if response.status_code in (403, 409):
                return {"status_code": response.status_code, "data": response.json()}
            response.raise_for_status()
            return {"status_code": response.status_code, "data": response.json()}

    async def get_active_ticket(self, telegram_id: int) -> Dict[str, Any]:
        url = f"{self.base_url}/tickets/active"
        response = await self._request(
            "GET",
            url,
            params={"telegram_id": telegram_id},
            headers=self._headers(),
            timeout=5,
        )
        response.raise_for_status()
        return response.json()

    async def send_admin_auth_decision(
        self, payload: Dict[str, Any], bot_secret: Optional[str]
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/auth/decision"
        headers = {"x-bot-secret": bot_secret} if bot_secret else {}
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers, timeout=5)
            response.raise_for_status()
            return response.json()

    async def send_affiliate_invoice_decision(
        self, payload: Dict[str, Any], bot_secret: Optional[str]
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/users/affiliates/invoices/decision"
        headers = {"x-bot-secret": bot_secret} if bot_secret else {}
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers, timeout=10)
            if response.status_code >= 400:
                try:
                    return {
                        "status_code": response.status_code,
                        "data": response.json(),
                    }
                except ValueError:
                    return {"status_code": response.status_code, "data": {}}
            return response.json()

    async def ban_user(
        self, telegram_id: int, payload: Dict[str, Any], bot_secret: Optional[str]
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/users/{telegram_id}/ban"
        headers = {"x-bot-secret": bot_secret} if bot_secret else {}
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers, timeout=5)
            if response.status_code >= 400:
                try:
                    return {
                        "status_code": response.status_code,
                        "data": response.json(),
                    }
                except ValueError:
                    return {"status_code": response.status_code, "data": {}}
            return response.json()


def _instrument_api_client_methods() -> None:
    if getattr(ApiClient, "_perf_instrumented", False):
        return

    for method_name, method in list(ApiClient.__dict__.items()):
        if method_name.startswith("_"):
            continue
        if not inspect.iscoroutinefunction(method):
            continue

        @wraps(method)
        async def _wrapped(self, *args, __method=method, __name=method_name, **kwargs):
            started_at = time.perf_counter()
            ok = False
            try:
                result = await __method(self, *args, **kwargs)
                ok = True
                return result
            finally:
                elapsed_ms = (time.perf_counter() - started_at) * 1000
                record_api_client_call(__name, elapsed_ms, ok)

        setattr(ApiClient, method_name, _wrapped)

    ApiClient._perf_instrumented = True


_instrument_api_client_methods()
