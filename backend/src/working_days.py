"""Bank working-day arithmetic for RBI deadlines, in IST.

A day is treated as a bank working day unless it is a Sunday, the 2nd or 4th
Saturday of the month, or a fixed national holiday (26 Jan, 15 Aug, 2 Oct).

State and moveable holidays (Diwali, Holi, Eid, regional days...) are NOT
included, on purpose: missing a holiday makes a deadline land EARLIER than
the real one, never later. Every date computed here is an estimate, and the
UI must say so: "estimated - act before this date".

Pure Python, no AWS calls.
"""
from __future__ import annotations

from datetime import date, timedelta
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

NATIONAL_HOLIDAYS = {(1, 26), (8, 15), (10, 2)}  # (month, day)
_SATURDAY, _SUNDAY = 5, 6


def is_bank_working_day(d: date) -> bool:
    if d.weekday() == _SUNDAY:
        return False
    if d.weekday() == _SATURDAY and (d.day - 1) // 7 + 1 in (2, 4):
        return False
    return (d.month, d.day) not in NATIONAL_HOLIDAYS


def add_working_days(start_date: date, n: int) -> date:
    """Return the n-th working day, counting start_date itself if it is one.

    This is the earliest (most conservative) reading of "within n working
    days". n must be at least 1.
    """
    if n < 1:
        raise ValueError("n must be >= 1")
    d, count = start_date, 0
    while True:
        if is_bank_working_day(d):
            count += 1
            if count == n:
                return d
        d += timedelta(days=1)
