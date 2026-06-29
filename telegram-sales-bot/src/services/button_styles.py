import json
import logging
from typing import Any

from aiogram.types import InlineKeyboardButton

from ..config import BOT_BUTTON_STYLE_RULES

_LOGGER = logging.getLogger(__name__)
_PATCHED = False
_ALLOWED_STYLES = {"primary", "success", "danger"}


def _load_rules() -> list[dict[str, str]]:
    raw = str(BOT_BUTTON_STYLE_RULES or "").strip()
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except Exception:
        _LOGGER.warning("BOT_BUTTON_STYLE_RULES is not valid JSON")
        return []
    if isinstance(parsed, dict):
        parsed = [parsed]
    if not isinstance(parsed, list):
        return []
    rules: list[dict[str, str]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        rule = {
            "callback_data": str(item.get("callback_data") or "").strip(),
            "url": str(item.get("url") or "").strip(),
            "text": str(item.get("text") or "").strip(),
            "style": str(item.get("style") or "").strip().lower(),
            "icon_custom_emoji_id": str(item.get("icon_custom_emoji_id") or "").strip(),
        }
        if rule["style"] not in _ALLOWED_STYLES:
            rule["style"] = ""
        if rule["icon_custom_emoji_id"] and not rule["icon_custom_emoji_id"].isdigit():
            rule["icon_custom_emoji_id"] = ""
        if (rule["callback_data"] or rule["url"] or rule["text"]) and (
            rule["style"] or rule["icon_custom_emoji_id"]
        ):
            rules.append(rule)
    return rules


_RULES = _load_rules()


def _get_attr(button: InlineKeyboardButton, key: str) -> str:
    value = getattr(button, key, None)
    if value is None:
        extra = getattr(button, "model_extra", None)
        if isinstance(extra, dict):
            value = extra.get(key)
    return str(value or "").strip()


def _match_rule(button: InlineKeyboardButton) -> dict[str, str] | None:
    callback_data = _get_attr(button, "callback_data")
    url = _get_attr(button, "url")
    text = _get_attr(button, "text")
    for rule in _RULES:
        if rule["callback_data"] and rule["callback_data"] == callback_data:
            return rule
        if rule["url"] and rule["url"] == url:
            return rule
        if rule["text"] and rule["text"] == text:
            return rule
    return None


def _inject_button_extras(button: InlineKeyboardButton, payload: dict[str, Any]) -> dict[str, Any]:
    style = str(payload.get("style") or _get_attr(button, "style") or "").strip().lower()
    icon_custom_emoji_id = str(
        payload.get("icon_custom_emoji_id") or _get_attr(button, "icon_custom_emoji_id") or ""
    ).strip()
    rule = _match_rule(button)
    if rule:
        style = style or rule.get("style", "")
        icon_custom_emoji_id = icon_custom_emoji_id or rule.get("icon_custom_emoji_id", "")
    if style in _ALLOWED_STYLES:
        payload["style"] = style
    if icon_custom_emoji_id.isdigit():
        payload["icon_custom_emoji_id"] = icon_custom_emoji_id
    return payload


def install_button_style_patch() -> None:
    global _PATCHED
    if _PATCHED:
        return
    _PATCHED = True

    original_model_dump = getattr(InlineKeyboardButton, "model_dump", None)
    if callable(original_model_dump):
        def model_dump_with_button_extras(self: InlineKeyboardButton, *args: Any, **kwargs: Any) -> dict[str, Any]:
            payload = original_model_dump(self, *args, **kwargs)
            if isinstance(payload, dict):
                return _inject_button_extras(self, payload)
            return payload

        InlineKeyboardButton.model_dump = model_dump_with_button_extras

    original_dict = getattr(InlineKeyboardButton, "dict", None)
    if callable(original_dict):
        def dict_with_button_extras(self: InlineKeyboardButton, *args: Any, **kwargs: Any) -> dict[str, Any]:
            payload = original_dict(self, *args, **kwargs)
            if isinstance(payload, dict):
                return _inject_button_extras(self, payload)
            return payload

        InlineKeyboardButton.dict = dict_with_button_extras
