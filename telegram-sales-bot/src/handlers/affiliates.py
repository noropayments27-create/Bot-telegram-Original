from datetime import datetime
import asyncio

from aiogram import F, Router
from aiogram.enums import ParseMode
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from ..config import API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET, BOT_USERNAME
from ..services.api_client import ApiClient
from ..services.i18n import t
from ..services.user_locale import get_user_locale
from ..utils.main_view import render_main_view, set_main_message_id
from ..utils.rate_limit import check_global_rate_limit
from ..config import (
    BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    BOT_RATE_LIMIT_ENABLED,
    BOT_RATE_LIMIT_SECONDS,
)

router = Router()
api_client = ApiClient(API_BASE_URL, API_TOKEN, BOT_TO_API_SECRET)


class AffiliateStates(StatesGroup):
    waiting_method = State()
    waiting_destination = State()


def _build_affiliate_keyboard(
    locale: str | None, has_affiliate: bool, is_approved: bool
) -> InlineKeyboardMarkup:
    buttons = []
    if is_approved:
        buttons.append(
            [
                InlineKeyboardButton(
                    text=t(locale, "affiliate_panel_button"),
                    callback_data="affiliate:panel",
                )
            ]
        )
    buttons.append(
        [
            InlineKeyboardButton(
                text=t(locale, "affiliate_info_button"),
                callback_data="affiliate:info",
            )
        ]
    )
    if not has_affiliate:
        buttons.append(
            [
                InlineKeyboardButton(
                    text=t(locale, "affiliate_apply_button"),
                    callback_data="affiliate:start:apply",
                )
            ]
        )
    buttons.append(
        [
            InlineKeyboardButton(
                text=t(locale, "affiliate_faq_button"),
                callback_data="affiliate:faq",
            )
        ]
    )
    buttons.append(
        [
            InlineKeyboardButton(
                text=t(locale, "btn_back"),
                callback_data="nav:back",
            )
        ]
    )
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def _build_method_keyboard(locale: str | None, action: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=t(locale, "affiliate_method_usdt"),
                    callback_data=f"affiliate:method:{action}:USDT_BSC",
                ),
                InlineKeyboardButton(
                    text=t(locale, "affiliate_method_binance"),
                    callback_data=f"affiliate:method:{action}:BINANCE_ID",
                ),
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_back"),
                    callback_data="nav:back",
                )
            ],
        ]
    )


def _build_referral_text(locale: str | None, code: str) -> str:
    if BOT_USERNAME:
        link = f"https://t.me/{BOT_USERNAME}?start={code}"
        return t(locale, "affiliate_referral_link").format(code=code, link=link)
    return t(locale, "affiliate_referral_code").format(code=code)


def _build_referral_link(code: str) -> str:
    if BOT_USERNAME:
        return f"https://t.me/{BOT_USERNAME}?start={code}"
    return code


def _format_date(value: str | None) -> str:
    if not value:
        return "-"
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.strftime("%d/%m/%Y")
    except Exception:
        return "-"


def _format_affiliate_code(affiliate_code: str | int | None) -> str:
    if not affiliate_code:
        return "-"
    return str(affiliate_code)


def _format_affiliate_status(locale: str | None, status: str | None) -> str:
    if not status:
        return t(locale, "affiliate_status_none")
    normalized = str(status).upper()
    if normalized == "APPROVED":
        return t(locale, "affiliate_status_approved")
    if normalized == "PENDING":
        return t(locale, "affiliate_status_pending")
    if normalized == "REJECTED":
        return t(locale, "affiliate_status_rejected")
    return normalized


def _compute_rank(
    sales_total: int,
    earnings_total: float,
    days_since_last_sale: int | None,
) -> str:
    if sales_total >= 100 and earnings_total >= 600:
        base_index = 5
    elif sales_total >= 70 and earnings_total >= 500:
        base_index = 4
    elif sales_total >= 40 and earnings_total >= 200:
        base_index = 3
    elif sales_total >= 20 and earnings_total >= 50:
        base_index = 2
    elif sales_total >= 2 and earnings_total >= 5:
        base_index = 1
    else:
        base_index = 0

    downgrade_steps = 0
    if days_since_last_sale is not None and days_since_last_sale >= 30:
        downgrade_steps = days_since_last_sale // 30

    final_index = max(0, base_index - downgrade_steps)
    labels = [
        "Novato 🎖️",
        "Bronce 🥉",
        "Plata 🥈",
        "Oro 🥇",
        "Diamante 💎",
        "Élite 👑",
    ]
    return labels[final_index]


def _get_level_details(
    sales_total: int,
    earnings_total: float,
    days_since_last_sale: int | None,
) -> dict:
    rank = _compute_rank(sales_total, earnings_total, days_since_last_sale)
    base_rates = {
        "Novato 🎖️": 0.05,
        "Bronce 🥉": 0.08,
        "Plata 🥈": 0.12,
        "Oro 🥇": 0.15,
        "Diamante 💎": 0.2,
        "Élite 👑": 0.3,
    }
    min_withdraw = {
        "Novato 🎖️": "$25 USD",
        "Bronce 🥉": "$20 USD",
        "Plata 🥈": "$15 USD",
        "Oro 🥇": "$10 USD",
        "Diamante 💎": "No aplica",
        "Élite 👑": "No aplica",
    }
    min_values = {
        "Novato 🎖️": 25,
        "Bronce 🥉": 20,
        "Plata 🥈": 15,
        "Oro 🥇": 10,
        "Diamante 💎": 0,
        "Élite 👑": 0,
    }
    return {
        "rank": rank,
        "base_rate": base_rates.get(rank, 0),
        "min_withdraw": min_withdraw.get(rank, "No aplica"),
        "min_withdraw_value": min_values.get(rank, 0),
    }


def _build_panel_keyboard(locale: str | None) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=t(locale, "affiliate_withdraw_button"),
                    callback_data="affiliate:withdraw",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "affiliate_channel_button"),
                    url="https://t.me/+2h-faKXvtNU3ZjVh",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "affiliate_group_button"),
                    url="https://t.me/+ssLE_Hx2xeE2Mzhh",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "affiliate_top_button"),
                    callback_data="affiliate:top",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_back"),
                    callback_data="nav:back",
                )
            ],
        ]
    )


def _build_top_keyboard(locale: str | None) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=t(locale, "affiliate_top_week_button"),
                    callback_data="affiliate:top:week",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "affiliate_top_day_button"),
                    callback_data="affiliate:top:day",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_back"),
                    callback_data="nav:back",
                )
            ],
        ]
    )


def _build_withdraw_keyboard(
    locale: str | None, allow_withdraw: bool
) -> InlineKeyboardMarkup:
    rows = []
    if allow_withdraw:
        rows.append(
            [
                InlineKeyboardButton(
                    text=t(locale, "affiliate_withdraw_all_button"),
                    callback_data="affiliate:withdraw:all",
                )
            ]
        )
    rows.append(
        [
            InlineKeyboardButton(
                text=t(locale, "affiliate_edit_wallet_button"),
                callback_data="affiliate:start:update",
            )
        ]
    )
    rows.append(
        [
            InlineKeyboardButton(
                text=t(locale, "btn_back"),
                callback_data="nav:back",
            )
        ]
    )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _build_withdraw_confirm_keyboard(locale: str | None) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=t(locale, "affiliate_withdraw_confirm_button"),
                    callback_data="affiliate:withdraw:confirm",
                )
            ],
            [
                InlineKeyboardButton(
                    text=t(locale, "btn_back"),
                    callback_data="nav:back",
                )
            ],
        ]
    )


def _format_money(value: object) -> str:
    try:
        amount = float(value)
    except (TypeError, ValueError):
        amount = 0.0
    return f"${amount:.2f}"


async def _render_affiliates_home(
    callback: CallbackQuery, state: FSMContext, locale: str | None
) -> None:
    set_main_message_id(callback.from_user.id, callback.message.message_id)
    has_affiliate = False
    is_approved = False
    affiliate_status = None
    affiliate = None

    try:
        data = await api_client.get_affiliate_status(callback.from_user.id)
        affiliate = data.get("affiliate")
        if affiliate:
            has_affiliate = True
            affiliate_status = affiliate.get("status")
            is_approved = affiliate_status == "APPROVED"
    except Exception:
        data = {}

    if is_approved and affiliate:
        affiliate_code = (data.get("user") or {}).get("telegram_id") or affiliate.get("id")
        referral_link = _build_referral_link(affiliate_code)
        sales_count = int(affiliate.get("sales_count") or 0)
        earnings_total = float(affiliate.get("earnings_total") or 0)
        days_since_last_sale = None
        try:
            last_sale_raw = affiliate.get("last_sale_at")
            if last_sale_raw:
                last_sale_dt = datetime.fromisoformat(last_sale_raw.replace("Z", "+00:00"))
                days_since_last_sale = max((datetime.utcnow() - last_sale_dt).days, 0)
        except Exception:
            days_since_last_sale = None
        level = _get_level_details(sales_count, earnings_total, days_since_last_sale)
        rank_text = level["rank"]
        boost_rate = float(affiliate.get("commission_rate") or 0)
        base_percent = int(round(level["base_rate"] * 100))
        boost_percent = int(round(boost_rate * 100))
        if boost_percent > 0:
            commission_text = f"{base_percent}% + {boost_percent}%"
        else:
            commission_text = f"{base_percent}%"
        approval_date = _format_date(affiliate.get("approved_at") or affiliate.get("created_at"))
        days_active = 0
        try:
            created_raw = affiliate.get("approved_at") or affiliate.get("created_at")
            if created_raw:
                created_dt = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
                days_active = max((datetime.utcnow() - created_dt).days + 1, 0)
        except Exception:
            days_active = 0
        inactivity_days = days_since_last_sale if days_since_last_sale is not None else "-"
        text = (
            "🌟 ¡BIENVENIDO AL EQUIPO! 🌟\n\n"
            f"🆔 ID: {callback.from_user.id}\n"
            f"👤 Usuario: {'@' + callback.from_user.username if callback.from_user.username else '-'}\n"
            f"{t(locale, 'affiliate_top_separator')}\n"
            f"🏅 Tu Rango: {rank_text}\n"
            f"💸 Comisión base: {commission_text}\n"
            f"📅 Antigüedad: {approval_date} [{days_active} dias]\n"
            f"💵 Mínimo retiro: {level['min_withdraw']}\n"
            f"⏳ Conteo de inactividad: {inactivity_days}\n"
            f"{t(locale, 'affiliate_top_separator')}\n"
            f"🧾 ID Afiliado: {_format_affiliate_code(affiliate_code)}\n\n"
            f"🔗 Link de referido: {referral_link}\n\n"
            "¿Qué te gustaría hacer hoy? 🚀"
        )
    else:
        text = (
            f"{t(locale, 'affiliate_welcome_title')}\n\n"
            f"{t(locale, 'affiliate_welcome_body')}"
        )
        if has_affiliate and affiliate_status:
            text += (
                f"\n\n{t(locale, 'affiliate_pending_notice').format(status=_format_affiliate_status(locale, affiliate_status))}"
            )

    await state.clear()
    await render_main_view(
        callback.message,
        callback.from_user.id,
        text,
        reply_markup=_build_affiliate_keyboard(locale, has_affiliate, is_approved),
        parse_mode=ParseMode.HTML,
    )


@router.callback_query(F.data == "home:affiliates")
async def handle_affiliates(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
        )
        return
    await _render_affiliates_home(callback, state, locale)
    await callback.answer()


@router.callback_query(F.data == "affiliate:info")
async def handle_affiliate_info(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    has_affiliate = False
    is_approved = False
    try:
        data = await api_client.get_affiliate_status(callback.from_user.id)
        affiliate = data.get("affiliate")
        if affiliate:
            has_affiliate = True
            is_approved = affiliate.get("status") == "APPROVED"
    except Exception:
        pass
    await render_main_view(
        callback.message,
        callback.from_user.id,
        t(locale, "affiliate_info_text"),
        reply_markup=_build_affiliate_keyboard(locale, has_affiliate, is_approved),
        parse_mode=ParseMode.HTML,
    )
    await callback.answer()


@router.callback_query(F.data == "affiliate:faq")
async def handle_affiliate_faq(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    has_affiliate = False
    is_approved = False
    try:
        data = await api_client.get_affiliate_status(callback.from_user.id)
        affiliate = data.get("affiliate")
        if affiliate:
            has_affiliate = True
            is_approved = affiliate.get("status") == "APPROVED"
    except Exception:
        pass
    await render_main_view(
        callback.message,
        callback.from_user.id,
        t(locale, "affiliate_faq_text"),
        reply_markup=_build_affiliate_keyboard(locale, has_affiliate, is_approved),
        parse_mode=ParseMode.HTML,
    )
    await callback.answer()


@router.callback_query(F.data == "affiliate:panel")
async def handle_affiliate_panel(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    try:
        data = await api_client.get_affiliate_status(callback.from_user.id)
        affiliate = data.get("affiliate")
        if affiliate and affiliate.get("status") == "APPROVED":
            sales_total = int(affiliate.get("sales_count") or 0)
            sales_today = int(affiliate.get("daily_sales") or 0)
            earnings_total = affiliate.get("earnings_total") or 0
            earnings_today = affiliate.get("daily_earnings") or 0
            referrals_total = affiliate.get("referrals_total") or 0
            daily_streak = int(affiliate.get("daily_streak") or 0)
            days_active = 0
            try:
                created_raw = affiliate.get("approved_at") or affiliate.get("created_at")
                if created_raw:
                    created_dt = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
                    days_active = max((datetime.utcnow() - created_dt).days + 1, 0)
            except Exception:
                days_active = 0
            daily_percent = 0
            try:
                daily_percent = min(int((float(earnings_today) / 10) * 100), 100)
            except Exception:
                daily_percent = 0
            earnings_today_text = f"${float(earnings_today):.2f}"
            earnings_total_text = f"${float(earnings_total):.2f}"
            text = (
                f"{t(locale, 'affiliate_stats_header')}\n\n"
                f"{t(locale, 'affiliate_stats_footer')}\n"
                f"{t(locale, 'affiliate_stats_earnings_today').format(amount=earnings_today_text)}\n"
                f"{t(locale, 'affiliate_stats_earnings_total').format(amount=earnings_total_text)}\n"
                f"{t(locale, 'affiliate_stats_footer')}\n"
                f"{t(locale, 'affiliate_stats_sales_today').format(count=sales_today)}\n"
                f"{t(locale, 'affiliate_stats_sales_total').format(count=sales_total)}\n"
                f"{t(locale, 'affiliate_stats_footer')}\n"
                f"{t(locale, 'affiliate_stats_referrals_total').format(count=referrals_total)}\n"
                f"{t(locale, 'affiliate_stats_goal').format(percent=daily_percent)}\n"
                f"{t(locale, 'affiliate_stats_footer')}\n"
                f"{t(locale, 'affiliate_stats_streak').format(days=daily_streak)}"
            )
            await render_main_view(
                callback.message,
                callback.from_user.id,
                text,
                reply_markup=_build_panel_keyboard(locale),
                parse_mode=ParseMode.HTML,
            )
            await callback.answer()
            return
    except Exception:
        pass
    await render_main_view(
        callback.message,
        callback.from_user.id,
        t(locale, "affiliate_panel_unavailable"),
        reply_markup=_build_affiliate_keyboard(locale, True, False),
        parse_mode=ParseMode.HTML,
    )
    await callback.answer()


@router.callback_query(F.data == "affiliate:top")
async def handle_affiliate_top(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    await _render_affiliate_top(callback, "global")


@router.callback_query(F.data == "affiliate:top:week")
async def handle_affiliate_top_week(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    await _render_affiliate_top(callback, "week")


@router.callback_query(F.data == "affiliate:top:day")
async def handle_affiliate_top_day(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    await _render_affiliate_top(callback, "day")


async def _render_affiliate_top(callback: CallbackQuery, period: str) -> None:
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    try:
        data = await api_client.get_affiliate_top(callback.from_user.id, period=period)
        rows = data.get("top") or []
        title_key = {
            "day": "affiliate_top_title_day",
            "week": "affiliate_top_title_week",
            "global": "affiliate_top_title_global",
        }.get(period, "affiliate_top_title_week")
        separator = t(locale, "affiliate_top_separator")
        lines = [
            t(locale, title_key),
            separator,
            t(locale, "affiliate_top_header"),
            separator,
        ]
        medals = ["🥇", "🥈", "🥉"]
        if not rows:
            lines.append(t(locale, "affiliate_top_empty"))
        else:
            for index, row in enumerate(rows[:3]):
                username = row.get("username") or "-"
                sales = row.get("sales_count") or 0
                earnings = _format_money(row.get("earnings_total"))
                lines.append(
                    t(locale, "affiliate_top_row").format(
                        medal=medals[index],
                        username=f"@{username}" if username != "-" else "-",
                        sales=sales,
                        earnings=earnings,
                    )
                )
        lines.append(separator)
        position = data.get("position") or "-"
        my_earnings = _format_money(data.get("my_earnings"))
        lines.append(t(locale, "affiliate_top_position").format(position=position))
        lines.append(t(locale, "affiliate_top_earnings").format(amount=my_earnings))
        await render_main_view(
            callback.message,
            callback.from_user.id,
            "\n".join(lines),
            reply_markup=_build_top_keyboard(locale),
            parse_mode=ParseMode.HTML,
        )
        await callback.answer()
        return
    except Exception:
        pass
    await callback.answer()


@router.callback_query(F.data == "affiliate:withdraw")
async def handle_affiliate_withdraw(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    try:
        data = await api_client.get_affiliate_status(callback.from_user.id)
        affiliate = data.get("affiliate") or {}
        destination = affiliate.get("wallet_usdt_bsc") or affiliate.get("binance_id") or "-"
        balance_value = float(affiliate.get("earnings_available") or 0)
        sales_count = int(affiliate.get("sales_count") or 0)
        earnings_total = float(affiliate.get("earnings_total") or 0)
        days_since_last_sale = None
        try:
            last_sale_raw = affiliate.get("last_sale_at")
            if last_sale_raw:
                last_sale_dt = datetime.fromisoformat(last_sale_raw.replace("Z", "+00:00"))
                days_since_last_sale = max((datetime.utcnow() - last_sale_dt).days, 0)
        except Exception:
            days_since_last_sale = None
        level = _get_level_details(sales_count, earnings_total, days_since_last_sale)
        min_required = float(level.get("min_withdraw_value") or 0)
        allow_withdraw = min_required <= 0 or balance_value >= min_required
        balance = f"${float(balance_value):.2f}"
        minimum_text = level.get("min_withdraw") or "-"
        separator = t(locale, "affiliate_stats_footer")
        pending_payout = affiliate.get("pending_payout") if isinstance(affiliate, dict) else None
        pending_lines = ""
        if pending_payout:
            pending_amount = _format_money(pending_payout.get("amount"))
            pending_date = _format_date(pending_payout.get("created_at"))
            pending_lines = (
                f"💸 Su solicitud de retiro por: {pending_amount}\n"
                "Esta en proceso... 🕑\n\n"
                f"Fecha de retiro: {pending_date}\n"
                f"{separator}\n"
            )
        text = (
            f"{t(locale, 'affiliate_withdraw_title')}\n\n"
            f"{separator}\n"
            f"{t(locale, 'affiliate_withdraw_balance').format(amount=balance)}\n"
            f"{separator}\n"
            f"{t(locale, 'affiliate_withdraw_minimum').format(amount=minimum_text)}\n"
            f"{t(locale, 'affiliate_withdraw_processing')}\n"
            f"{separator}\n"
            f"{t(locale, 'affiliate_withdraw_destination').format(destination=destination)}\n"
            f"{separator}\n"
            f"{pending_lines}"
        )
        await render_main_view(
            callback.message,
            callback.from_user.id,
            text,
            reply_markup=_build_withdraw_keyboard(locale, allow_withdraw),
            parse_mode=ParseMode.HTML,
        )
        await callback.answer()
        return
    except Exception:
        pass
    await callback.answer()


@router.callback_query(F.data == "affiliate:withdraw:all")
async def handle_affiliate_withdraw_all(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    try:
        data = await api_client.get_affiliate_status(callback.from_user.id)
        affiliate = data.get("affiliate") or {}
        destination = affiliate.get("wallet_usdt_bsc") or affiliate.get("binance_id") or "-"
        balance_value = float(affiliate.get("earnings_available") or 0)
        sales_count = int(affiliate.get("sales_count") or 0)
        earnings_total = float(affiliate.get("earnings_total") or 0)
        days_since_last_sale = None
        try:
            last_sale_raw = affiliate.get("last_sale_at")
            if last_sale_raw:
                last_sale_dt = datetime.fromisoformat(last_sale_raw.replace("Z", "+00:00"))
                days_since_last_sale = max((datetime.utcnow() - last_sale_dt).days, 0)
        except Exception:
            days_since_last_sale = None
        level = _get_level_details(sales_count, earnings_total, days_since_last_sale)
        min_required = float(level.get("min_withdraw_value") or 0)
        if destination == "-":
            await callback.answer(
                t(locale, "affiliate_withdraw_missing_destination"),
                show_alert=True,
            )
            return
        if balance_value <= 0:
            await callback.answer(t(locale, "affiliate_withdraw_no_balance"), show_alert=True)
            return
        if min_required > 0 and balance_value < min_required:
            await callback.answer(
                t(locale, "affiliate_withdraw_minimum_required").format(amount=min_required),
                show_alert=True,
            )
            return
        balance = _format_money(balance_value)
        text = (
            f"{t(locale, 'affiliate_withdraw_confirm_title')}\n\n"
            f"{t(locale, 'affiliate_withdraw_confirm_destination').format(destination=destination)}\n"
            f"{t(locale, 'affiliate_withdraw_confirm_amount').format(amount=balance)}"
        )
        await render_main_view(
            callback.message,
            callback.from_user.id,
            text,
            reply_markup=_build_withdraw_confirm_keyboard(locale),
            parse_mode=ParseMode.HTML,
        )
        await callback.answer()
        return
    except Exception:
        pass
    await callback.answer()


@router.callback_query(F.data == "affiliate:withdraw:confirm")
async def handle_affiliate_withdraw_confirm(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    try:
        await api_client.request_affiliate_withdraw(callback.from_user.id)
        await render_main_view(
            callback.message,
            callback.from_user.id,
            t(locale, "affiliate_withdraw_requested"),
            reply_markup=None,
            parse_mode=ParseMode.HTML,
        )
        await callback.answer()
        await asyncio.sleep(5)
        await _render_affiliates_home(callback, state, locale)
        return
    except Exception:
        await callback.answer(t(locale, "affiliate_withdraw_failed"), show_alert=True)


@router.callback_query(F.data.startswith("affiliate:start:"))
async def handle_affiliate_start(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
        )
        return
    action = callback.data.split(":")[-1]
    await state.update_data(affiliate_action=action)
    await state.set_state(AffiliateStates.waiting_method)
    await render_main_view(
        callback.message,
        callback.from_user.id,
        t(locale, "affiliate_choose_method"),
        reply_markup=_build_method_keyboard(locale, action),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("affiliate:method:"))
async def handle_affiliate_method(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.message or not callback.from_user:
        return
    locale = await get_user_locale(
        api_client, callback.from_user.id, callback.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        callback.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await callback.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds),
            show_alert=True,
        )
        return
    _, _, action, method = callback.data.split(":", 3)
    await state.update_data(affiliate_method=method, affiliate_action=action)
    await state.set_state(AffiliateStates.waiting_destination)
    prompt_key = "affiliate_enter_wallet" if method == "USDT_BSC" else "affiliate_enter_binance"
    await render_main_view(
        callback.message,
        callback.from_user.id,
        t(locale, prompt_key),
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text=t(locale, "btn_back"),
                        callback_data="nav:back",
                    )
                ]
            ]
        ),
    )
    await callback.answer()


@router.message(AffiliateStates.waiting_destination)
async def handle_affiliate_destination(message: Message, state: FSMContext) -> None:
    if not message.from_user:
        return
    locale = await get_user_locale(
        api_client, message.from_user.id, message.from_user.language_code
    )
    wait_seconds = check_global_rate_limit(
        message.from_user.id,
        BOT_RATE_LIMIT_SECONDS,
        BOT_RATE_LIMIT_ENABLED,
        BOT_RATE_LIMIT_BYPASS_TELEGRAM_IDS,
    )
    if wait_seconds > 0:
        await message.answer(
            t(locale, "rate_limit_wait").format(seconds=wait_seconds)
        )
        return
    destination = (message.text or "").strip()
    if not destination:
        await message.answer(t(locale, "affiliate_destination_required"))
        return
    data = await state.get_data()
    method = data.get("affiliate_method")
    photo_file_id = None
    try:
        photos = await message.bot.get_user_profile_photos(
            message.from_user.id, limit=1
        )
        if photos.total_count > 0 and photos.photos:
            photo_file_id = photos.photos[0][-1].file_id
    except Exception:
        photo_file_id = None
    payload = {
        "telegram_id": message.from_user.id,
        "telegram_username": message.from_user.username,
        "telegram_photo_file_id": photo_file_id,
        "method": method,
        "wallet_usdt_bsc": destination if method == "USDT_BSC" else None,
        "binance_id": destination if method == "BINANCE_ID" else None,
    }
    result = await api_client.apply_affiliate(payload)
    if result.get("error"):
        error_code = result.get("error")
        if error_code == "USERNAME_REQUIRED":
            await message.answer(t(locale, "affiliate_apply_missing_username"))
        elif error_code == "PHOTO_REQUIRED":
            await message.answer(t(locale, "affiliate_apply_missing_photo"))
        elif error_code == "SCAMMER_REPORTED":
            await message.answer(t(locale, "affiliate_apply_scammer"))
        else:
            await message.answer(t(locale, "affiliate_apply_error"))
        await state.clear()
        return
    affiliate = result.get("affiliate") or {}
    referral_text = ""
    if affiliate.get("status") == "APPROVED":
        referral_text = _build_referral_text(locale, message.from_user.id)
    if not referral_text:
        try:
            status_data = await api_client.get_affiliate_status(message.from_user.id)
            affiliate = status_data.get("affiliate") or {}
            if affiliate.get("status") == "APPROVED":
                referral_text = _build_referral_text(locale, message.from_user.id)
        except Exception:
            referral_text = ""
    reply = f"{t(locale, 'affiliate_apply_success')}"
    if referral_text:
        reply = f"{reply}\n\n{referral_text}"
    await message.answer(reply, parse_mode=ParseMode.HTML)
    await state.clear()
