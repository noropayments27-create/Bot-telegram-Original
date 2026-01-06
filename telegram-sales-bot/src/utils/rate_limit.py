import math
import time
from typing import Dict, Optional, Set

_RATE_LIMITS: Dict[str, float] = {}


def check_rate_limit(
    telegram_id: int,
    action_key: str,
    cooldown_seconds: int,
    enabled: bool,
    bypass_ids: Optional[Set[int]] = None,
) -> int:
    if not enabled or cooldown_seconds <= 0:
        return 0

    if bypass_ids and telegram_id in bypass_ids:
        return 0

    now = time.monotonic()
    key = f"{telegram_id}:{action_key}"
    expires_at = _RATE_LIMITS.get(key)

    if expires_at and expires_at > now:
        return max(1, int(math.ceil(expires_at - now)))

    _RATE_LIMITS[key] = now + cooldown_seconds
    return 0
