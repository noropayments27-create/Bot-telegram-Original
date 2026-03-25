import re
from typing import Dict, Optional

_PRODUCT_TOKEN_PATTERN = re.compile(r"^[0-9A-Za-z_-]{2,40}$")
_AFFILIATE_CODE_PATTERN = re.compile(r"^[0-9a-fA-F-]{1,64}$")
_GIFT_TOKEN_PATTERN = re.compile(r"^[0-9a-zA-Z_-]{8,64}$")


def _clean_token(value: str | None) -> str:
    return str(value or "").strip()


def _is_valid_product_token(value: str) -> bool:
    return bool(_PRODUCT_TOKEN_PATTERN.fullmatch(value))


def _is_valid_affiliate_code(value: str) -> bool:
    return bool(_AFFILIATE_CODE_PATTERN.fullmatch(value))


def build_product_start_payload(
    product_token: str | None,
    affiliate_code: str | None = None,
) -> Optional[str]:
    product_value = _clean_token(product_token)
    if not _is_valid_product_token(product_value):
        return None

    affiliate_value = _clean_token(affiliate_code)
    if _is_valid_affiliate_code(affiliate_value):
        payload = f"r{affiliate_value}_p{product_value}"
    else:
        payload = f"p{product_value}"

    if len(payload) > 64:
        return None
    return payload


def parse_start_payload(raw_payload: str | None) -> Dict[str, Optional[str] | bool]:
    payload = _clean_token(raw_payload)
    if not payload:
        return {
            "affiliate_code": None,
            "product_id": None,
            "gift_token": None,
            "fallback_code": None,
            "is_product_payload": False,
            "is_gift_payload": False,
        }

    if payload.startswith("g") and len(payload) > 1:
        gift_token = _clean_token(payload[1:])
        if _GIFT_TOKEN_PATTERN.fullmatch(gift_token):
            return {
                "affiliate_code": None,
                "product_id": None,
                "gift_token": gift_token,
                "fallback_code": None,
                "is_product_payload": False,
                "is_gift_payload": True,
            }

    # Backward compatibility: a_<affiliate>_p_<product>
    if payload.startswith("a_") and "_p_" in payload:
        affiliate_code, product_id = payload[2:].split("_p_", maxsplit=1)
        affiliate_value = _clean_token(affiliate_code)
        product_value = _clean_token(product_id)
        if _is_valid_affiliate_code(affiliate_value) and _is_valid_product_token(product_value):
            return {
                "affiliate_code": affiliate_value,
                "product_id": product_value,
                "gift_token": None,
                "fallback_code": None,
                "is_product_payload": True,
                "is_gift_payload": False,
            }

    # New short format: r<affiliate>_p<product>
    if payload.startswith("r") and "_p" in payload:
        affiliate_code, product_token = payload[1:].split("_p", maxsplit=1)
        affiliate_value = _clean_token(affiliate_code)
        product_value = _clean_token(product_token)
        if _is_valid_affiliate_code(affiliate_value) and _is_valid_product_token(product_value):
            return {
                "affiliate_code": affiliate_value,
                "product_id": product_value,
                "gift_token": None,
                "fallback_code": None,
                "is_product_payload": True,
                "is_gift_payload": False,
            }

    # Backward compatibility: p_<product>
    if payload.startswith("p_"):
        product_value = _clean_token(payload[2:])
        if _is_valid_product_token(product_value):
            return {
                "affiliate_code": None,
                "product_id": product_value,
                "gift_token": None,
                "fallback_code": None,
                "is_product_payload": True,
                "is_gift_payload": False,
            }

    # New short format: p<product>
    if payload.startswith("p") and len(payload) > 1:
        product_value = _clean_token(payload[1:])
        if _is_valid_product_token(product_value):
            return {
                "affiliate_code": None,
                "product_id": product_value,
                "gift_token": None,
                "fallback_code": None,
                "is_product_payload": True,
                "is_gift_payload": False,
            }

    return {
        "affiliate_code": None,
        "product_id": None,
        "gift_token": None,
        "fallback_code": payload,
        "is_product_payload": False,
        "is_gift_payload": False,
    }


def build_bot_start_link(bot_username: str | None, payload: str | None) -> Optional[str]:
    clean_bot = _clean_token(bot_username).lstrip("@")
    clean_payload = _clean_token(payload)
    if not clean_bot or not clean_payload:
        return None
    return f"https://t.me/{clean_bot}?start={clean_payload}"
