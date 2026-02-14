from typing import Any, Dict, Optional

import asyncio
import httpx
from ..config import ADMIN_API_KEY, PAYMENT_PROOF_SUBMIT_TIMEOUT_SECONDS


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
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/products"
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                params={
                    "active": "true",
                    "page": page,
                    "page_size": page_size,
                    "telegram_id": telegram_id,
                },
                headers=self._headers(),
                timeout=5,
            )
            response.raise_for_status()
            return response.json()

    async def create_order(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/orders"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json=payload, headers=self._headers(), timeout=5
            )
            if response.status_code == 409:
                return {"status_code": 409, "data": response.json()}
            response.raise_for_status()
            return response.json()

    async def submit_payment_proof(self, order_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/orders/{order_id}/payment-proof"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json=payload,
                headers=self._headers(),
                timeout=PAYMENT_PROOF_SUBMIT_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
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
        self, message: str, segment: str = "ALL_USERS"
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/admin/broadcasts"
        payload = {"message": message, "segment": segment}
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json=payload, headers=self._headers(), timeout=30
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
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self._headers(), timeout=5)
            response.raise_for_status()
            return response.json()

    async def get_payment_methods(self) -> Dict[str, Any]:
        url = f"{self.base_url}/orders/payment-methods"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self._headers(), timeout=5)
            response.raise_for_status()
            return response.json()

    async def get_user(self, telegram_id: int) -> Dict[str, Any]:
        url = f"{self.base_url}/users/{telegram_id}"

        async def _do() -> Dict[str, Any]:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url, headers=self._headers(), timeout=15
                )
                response.raise_for_status()
                return response.json()

        return await _request_with_retry(_do)

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

    async def get_ban_status(self, telegram_id: int) -> Dict[str, Any]:
        url = f"{self.base_url}/users/{telegram_id}/ban"

        async def _do() -> Dict[str, Any]:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url, headers=self._headers(), timeout=10
                )
                response.raise_for_status()
                return response.json()

        return await _request_with_retry(_do)

    async def get_maintenance_status(self) -> Dict[str, Any]:
        url = f"{self.base_url}/bot/maintenance"

        async def _do() -> Dict[str, Any]:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url, headers=self._headers(), timeout=10
                )
                response.raise_for_status()
                return response.json()

        return await _request_with_retry(_do)

    async def get_bot_assets(self) -> Dict[str, Any]:
        url = f"{self.base_url}/bot/assets"

        async def _do() -> Dict[str, Any]:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url, headers=self._headers(), timeout=10
                )
                response.raise_for_status()
                return response.json()

        return await _request_with_retry(_do)

    async def get_bot_layout(self, key: str) -> Dict[str, Any]:
        url = f"{self.base_url}/bot/layouts/{key}"

        async def _do() -> Dict[str, Any]:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url, headers=self._headers(), timeout=10
                )
                response.raise_for_status()
                return response.json()

        return await _request_with_retry(_do)

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
            async with httpx.AsyncClient() as client:
                response = await client.get(
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
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url, json=payload, headers=self._headers(), timeout=15
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
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json=payload, headers=self._headers(), timeout=15
            )
            response.raise_for_status()
            return response.json()

    async def checkout_cart(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/bot/cart/checkout"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json=payload, headers=self._headers(), timeout=15
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
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=5)
            if response.status_code in (400, 403, 409):
                return {"status_code": response.status_code, "data": response.json()}
            response.raise_for_status()
            return {"status_code": response.status_code, "data": response.json()}

    async def get_affiliate_status(self, telegram_id: int) -> Dict[str, Any]:
        url = f"{self.base_url}/users/affiliates/status"
        async with httpx.AsyncClient() as client:
            response = await client.get(
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
            response = await client.post(url, json=payload, timeout=5)
            if response.status_code in (403, 409):
                return {"status_code": response.status_code, "data": response.json()}
            response.raise_for_status()
            return {"status_code": response.status_code, "data": response.json()}

    async def get_active_ticket(self, telegram_id: int) -> Dict[str, Any]:
        url = f"{self.base_url}/tickets/active"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params={"telegram_id": telegram_id}, timeout=5)
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
