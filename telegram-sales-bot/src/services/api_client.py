from typing import Any, Dict, Optional

import asyncio
import httpx


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
    def __init__(self, base_url: str, token: Optional[str] = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token

    def _headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
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

    async def list_products(self, page: int = 1, page_size: int = 8) -> Dict[str, Any]:
        url = f"{self.base_url}/products"
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                params={"active": "true", "page": page, "page_size": page_size},
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
            response.raise_for_status()
            return response.json()

    async def submit_payment_proof(self, order_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/orders/{order_id}/payment-proof"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json=payload, headers=self._headers(), timeout=5
            )
            response.raise_for_status()
            return response.json()

    async def get_order(self, order_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/orders/{order_id}"
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
            response.raise_for_status()
            return response.json()

    async def open_or_create_ticket(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/tickets/open-or-create"
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=5)
            if response.status_code == 409:
                return {"status_code": 409, "data": response.json()}
            response.raise_for_status()
            return {"status_code": response.status_code, "data": response.json()}

    async def send_ticket_message(
        self, ticket_id: str, payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/tickets/{ticket_id}/message"
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=5)
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
