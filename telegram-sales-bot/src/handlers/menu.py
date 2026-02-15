from aiogram import Router
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from ..services.i18n import t

router = Router()


def _locale_key(locale: str | None) -> str:
    return "en" if str(locale or "").lower().startswith("en") else "es"


def _default_home_buttons(locale: str | None = None) -> list[dict[str, str]]:
    return [
        {"label": t(locale, "menu_shop"), "action": "shop:page:1"},
        {"label": t(locale, "menu_methods"), "action": "category:page:metodos"},
        {"label": t(locale, "menu_groups"), "action": "category:page:vip"},
        {"label": t(locale, "menu_programs"), "action": "category:page:programas"},
        {"label": t(locale, "menu_cart"), "action": "home:cart"},
        {"label": t(locale, "menu_affiliates"), "action": "home:affiliates"},
        {"label": t(locale, "menu_community"), "action": "home:community"},
        {"label": t(locale, "menu_support"), "action": "home:support"},
        {"label": t(locale, "menu_language"), "action": "home:soon:idioma"},
    ]


def _default_community_buttons(locale: str | None = None) -> list[dict[str, str]]:
    return [
        {"label": t(locale, "btn_back"), "action": "nav:back"},
        {"label": t(locale, "btn_home"), "action": "home:show"},
    ]


def _default_support_buttons(locale: str | None = None) -> list[dict[str, str]]:
    return [
        {"label": t(locale, "support_subject_purchase"), "action": "support:purchase"},
        {"label": t(locale, "support_subject_bug"), "action": "support:bug"},
        {"label": t(locale, "btn_back"), "action": "nav:back"},
        {"label": t(locale, "btn_home"), "action": "home:show"},
    ]


def _pair_buttons(buttons: list[dict[str, str]]) -> list[list[dict[str, str]]]:
    rows: list[list[dict[str, str]]] = []
    for button in buttons:
        if rows and len(rows[-1]) < 2:
            rows[-1].append(button)
        else:
            rows.append([button])
    return rows


def _normalize_layout_button(
    item: object,
) -> dict[str, str] | None:
    if not isinstance(item, dict):
        return None
    label = str(item.get("label") or item.get("text") or "").strip()
    action = str(item.get("action") or item.get("callback_data") or "").strip()
    url = str(item.get("url") or "").strip()
    if not label:
        return None
    if url:
        return {"label": label[:64], "url": url}
    if not action:
        return None
    return {"label": label[:64], "action": action[:64]}


def _normalize_layout_buttons(
    raw_buttons: object,
    locale: str | None = None,
    fallback_buttons: list[dict[str, str]] | None = None,
) -> list[list[dict[str, str]]]:
    fallback = _pair_buttons(fallback_buttons or _default_home_buttons(locale))
    if not isinstance(raw_buttons, list):
        return fallback

    parsed_rows: list[list[dict[str, str]]] = []
    flat_parsed: list[dict[str, str]] = []
    for item in raw_buttons:
        if isinstance(item, list):
            row: list[dict[str, str]] = []
            for nested in item:
                parsed = _normalize_layout_button(nested)
                if parsed:
                    row.append(parsed)
            if row:
                parsed_rows.append(row[:2])
            continue
        parsed = _normalize_layout_button(item)
        if parsed:
            flat_parsed.append(parsed)

    if parsed_rows:
        for button in flat_parsed:
            if parsed_rows[-1] and len(parsed_rows[-1]) < 2:
                parsed_rows[-1].append(button)
            else:
                parsed_rows.append([button])
        return parsed_rows or fallback

    return _pair_buttons(flat_parsed) or fallback


def build_home_text(
    locale: str | None = None,
    home_layout: dict | None = None,
) -> str:
    locale_value = _locale_key(locale)
    if isinstance(home_layout, dict):
        localized = home_layout.get(locale_value)
        if isinstance(localized, dict):
            custom_text = str(localized.get("text") or "").strip()
            if custom_text:
                return custom_text
    return t(locale, "home_welcome")


def _build_section_text_from_layout(
    locale: str | None,
    section_layout: dict | None,
    fallback_text: str,
) -> str:
    locale_value = _locale_key(locale)
    if isinstance(section_layout, dict):
        localized = section_layout.get(locale_value)
        if isinstance(localized, dict):
            custom_text = str(localized.get("text") or "").strip()
            if custom_text:
                return custom_text
    return fallback_text


def _build_keyboard_from_rows(
    rows: list[list[dict[str, str]]],
) -> InlineKeyboardMarkup:
    inline_rows: list[list[InlineKeyboardButton]] = []
    for row in rows:
        keyboard_row: list[InlineKeyboardButton] = []
        for button in row[:2]:
            text = button.get("label") or "Button"
            action = button.get("action")
            url = button.get("url")
            if url:
                keyboard_row.append(InlineKeyboardButton(text=text, url=url))
            elif action:
                keyboard_row.append(InlineKeyboardButton(text=text, callback_data=action))
        if keyboard_row:
            inline_rows.append(keyboard_row)
    return InlineKeyboardMarkup(inline_keyboard=inline_rows)


def build_community_text(
    locale: str | None = None,
    section_layout: dict | None = None,
) -> str:
    return _build_section_text_from_layout(locale, section_layout, t(locale, "community_text"))


def build_community_keyboard(
    locale: str | None = None,
    section_layout: dict | None = None,
) -> InlineKeyboardMarkup:
    locale_value = _locale_key(locale)
    raw_buttons = None
    if isinstance(section_layout, dict):
        localized = section_layout.get(locale_value)
        if isinstance(localized, dict):
            raw_buttons = localized.get("buttons")
    rows = _normalize_layout_buttons(
        raw_buttons,
        locale,
        fallback_buttons=_default_community_buttons(locale),
    )
    return _build_keyboard_from_rows(rows)


def build_support_menu_text(
    locale: str | None = None,
    section_layout: dict | None = None,
) -> str:
    fallback_text = f"{t(locale, 'support_menu_title')}\n\n{t(locale, 'support_menu_body')}"
    return _build_section_text_from_layout(locale, section_layout, fallback_text)


def build_support_menu_keyboard(
    locale: str | None = None,
    section_layout: dict | None = None,
) -> InlineKeyboardMarkup:
    locale_value = _locale_key(locale)
    raw_buttons = None
    if isinstance(section_layout, dict):
        localized = section_layout.get(locale_value)
        if isinstance(localized, dict):
            raw_buttons = localized.get("buttons")
    rows = _normalize_layout_buttons(
        raw_buttons,
        locale,
        fallback_buttons=_default_support_buttons(locale),
    )
    return _build_keyboard_from_rows(rows)


def build_main_keyboard(
    locale: str | None = None,
    home_layout: dict | None = None,
) -> InlineKeyboardMarkup:
    locale_value = _locale_key(locale)
    raw_buttons = None
    if isinstance(home_layout, dict):
        localized = home_layout.get(locale_value)
        if isinstance(localized, dict):
            raw_buttons = localized.get("buttons")
    button_rows = _normalize_layout_buttons(raw_buttons, locale)

    return _build_keyboard_from_rows(button_rows)


def build_language_keyboard(locale: str | None = None) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_language_es"), callback_data="lang:set:es"
                ),
                InlineKeyboardButton(
                    text=t(locale, "btn_language_en"), callback_data="lang:set:en"
                ),
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_language_back"),
                    callback_data="nav:back",
                ),
                InlineKeyboardButton(
                    text=t(locale, "btn_home"),
                    callback_data="home:show",
                ),
            ],
        ]
    )
