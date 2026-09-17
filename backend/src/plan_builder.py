"""Build the victim's action plan: deadlines, ordered steps, 1930 call script.

Pure Python, no AWS calls. Every deadline is an estimate (see working_days).
"""
from __future__ import annotations

import math
import re
from datetime import date, datetime, time, timedelta

from working_days import IST, add_working_days

SHARED_CREDENTIALS = ("yes", "no", "not_sure")

RBI_OMBUDSMAN_URL = "https://cms.rbi.org.in"
NCRP_URL = "https://cybercrime.gov.in"
CHAKSHU_URL = "https://sancharsaathi.gov.in"

DISCLAIMERS = [
    "Thaam is not a government service and is not affiliated with I4C, NCRP, RBI or any bank.",
    "This is guidance, not legal advice.",
    "Deadlines are estimated; act before the dates shown.",
]

UNKNOWN = {"en": "[not known]", "hi": "[पता नहीं]"}

_MONTHS = {
    "en": ["January", "February", "March", "April", "May", "June", "July",
           "August", "September", "October", "November", "December"],
    "hi": ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई",
           "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"],
}

_SCRIPT = {
    "en": (
        "Hello, I want to report a cyber fraud. Rupees {amount} was debited from my "
        "{bank} account ending {last4} on {date} at {time}. The UPI reference number, "
        "the UTR, is {utr}. The money went to {payee}. {path_line} My name is "
        "[your name] and my mobile number is [your number]."
    ),
    "hi": (
        "नमस्ते, मुझे साइबर धोखाधड़ी की शिकायत दर्ज करानी है। {date} को {time} बजे मेरे "
        "{bank} खाते से, जिसके आख़िरी चार अंक {last4} हैं, {amount} रुपये कटे हैं। "
        "यूपीआई रेफ़रेंस नंबर, यानी यूटीआर, {utr} है। पैसे {payee} को गए हैं। "
        "{path_line} मेरा नाम [अपना नाम] है और मेरा मोबाइल नंबर [अपना नंबर] है।"
    ),
}

_PATH_LINE = {
    "unauthorised": {
        "en": "I did not make or approve this payment.",
        "hi": "यह भुगतान मैंने नहीं किया है और न ही इसकी अनुमति दी है।",
    },
    "authorised": {
        "en": "I was tricked into making this payment.",
        "hi": "मुझसे धोखे से यह भुगतान करवाया गया है।",
    },
}


# ---------------- formatting helpers ----------------

def _iso(dt: datetime) -> str:
    return dt.astimezone(IST).isoformat(timespec="seconds")


def _end_of_day(d: date) -> datetime:
    return datetime.combine(d, time(23, 59, 59), tzinfo=IST)


def format_inr(amount: str) -> str:
    """'1234567.5' -> '12,34,567.50' (Indian digit grouping)."""
    rupees, _, paise = f"{float(amount):.2f}".partition(".")
    if len(rupees) > 3:
        head, tail = rupees[:-3], rupees[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        rupees = ",".join(groups + [tail])
    return f"{rupees}.{paise}"


def space_digits(value: str, group: int = 4) -> str:
    """'426173859012' -> '4261 7385 9012', easier to read aloud."""
    return " ".join(value[i:i + group] for i in range(0, len(value), group))


def _parse_time(value) -> tuple[time, bool]:
    """Return (time, estimated). A missing or malformed time -> start of day."""
    if value and re.fullmatch(r"\d{2}:\d{2}(:\d{2})?", value):
        try:
            return time.fromisoformat(value), False
        except ValueError:
            pass
    return time(0, 0), True


# ---------------- plan pieces ----------------

def _clocks(path: str, txn_dt: datetime, reported_at: datetime, now: datetime) -> dict:
    golden_deadline = txn_dt + timedelta(hours=1)
    expired = now >= golden_deadline
    clocks = {
        "goldenHour": {
            "deadline": _iso(golden_deadline),
            "minutesLeft": math.floor((golden_deadline - now).total_seconds() / 60),
            "expired": expired,
            "message": "Call 1930 anyway — money can still sometimes be frozen." if expired else None,
            "estimated": True,
        },
    }
    txn_date = txn_dt.date()
    if path == "unauthorised":
        clocks["bankReport"] = {
            "deadline": _iso(_end_of_day(add_working_days(txn_date, 3))),
            "rule": "RBI circular 6 Jul 2017: zero liability if reported within 3 working days",
            "estimated": True,
        }
        clocks["limitedLiability"] = {
            "until": _iso(_end_of_day(add_working_days(txn_date, 7))),
            "estimated": True,
        }
        clocks["shadowCredit"] = {
            "by": _iso(_end_of_day(add_working_days(reported_at.date(), 10))),
            "estimated": True,
        }
        clocks["resolution"] = {
            "by": _iso(reported_at + timedelta(days=90)),
            "estimated": True,
        }
    clocks["ombudsman"] = {
        "eligibleFrom": _iso(reported_at + timedelta(days=30)),
        "url": RBI_OMBUDSMAN_URL,
        "estimated": True,
    }
    return clocks


def _spoken_date(d: date, lang: str = "en") -> str:
    """date(2026, 9, 19) -> '19 September 2026'."""
    return f"{d.day} {_MONTHS[lang][d.month - 1]} {d.year}"


def _steps(path: str, clocks: dict) -> list[dict]:
    steps = [
        {"id": "call_1930", "title": "Call 1930 now",
         "detail": "Call the cyber crime helpline and read out the script below.",
         "tel": "1930"},
        {"id": "file_ncrp", "title": "File a complaint online",
         "detail": "File on the National Cyber Crime Reporting Portal using the text Thaam prepares.",
         "url": NCRP_URL},
        {"id": "keep_ack", "title": "Keep the acknowledgement number",
         "detail": "Write down the acknowledgement number you receive"},
        {"id": "block_payments", "title": "Block your card or UPI",
         "detail": "Ask your bank to block your card/UPI"},
    ]
    if path == "unauthorised":
        steps.append({
            "id": "bank_letter", "title": "Send a written complaint to your bank",
            "detail": "Send the written complaint to your bank before "
                      + _spoken_date(datetime.fromisoformat(clocks["bankReport"]["deadline"]).date()),
        })
    else:
        steps.append({
            "id": "fir", "title": "File an FIR",
            "detail": "File an FIR at your nearest police station with the acknowledgement number",
        })
        steps.append({
            "id": "chakshu", "title": "Report the scammer's number",
            "detail": "Report the scammer's number on Chakshu",
            "url": CHAKSHU_URL,
        })
    return steps


def _script(fields: dict, path: str, txn_date: date, time_estimated: bool) -> dict:
    account_digits = re.sub(r"\D", "", fields.get("account_masked") or "")
    amount, utr = fields.get("amount"), fields.get("utr")
    scripts = {}
    for lang in ("en", "hi"):
        unknown = UNKNOWN[lang]
        scripts[lang] = _SCRIPT[lang].format(
            amount=format_inr(amount) if amount else unknown,
            bank=fields.get("bank") or unknown,
            last4=account_digits[-4:] if account_digits else unknown,
            date=_spoken_date(txn_date, lang),
            time=unknown if time_estimated else fields["txn_time"][:5],
            utr=space_digits(utr) if utr else unknown,
            payee=fields.get("payee_vpa") or fields.get("payee_phone") or unknown,
            path_line=_PATH_LINE[path][lang],
        )
    return scripts


def build_plan(fields: dict, shared_credentials: str, reported_at: datetime, now: datetime) -> dict:
    """Build the plan.

    fields must contain a valid txn_date (YYYY-MM-DD); the handler validates
    the rest. reported_at and now must be timezone-aware (converted to IST).
    """
    if shared_credentials not in SHARED_CREDENTIALS:
        raise ValueError("shared_credentials must be yes, no or not_sure")
    path = "authorised" if shared_credentials == "yes" else "unauthorised"

    txn_date = date.fromisoformat(fields["txn_date"])
    txn_time, time_estimated = _parse_time(fields.get("txn_time"))
    txn_dt = datetime.combine(txn_date, txn_time, tzinfo=IST)
    reported_at = reported_at.astimezone(IST)
    now = now.astimezone(IST)

    clocks = _clocks(path, txn_dt, reported_at, now)
    # Also inside the clock, so the API response carries it without a new key.
    clocks["goldenHour"]["timeEstimated"] = time_estimated
    return {
        "path": path,
        "notSure": shared_credentials == "not_sure",
        "timeEstimated": time_estimated,
        "clocks": clocks,
        "steps": _steps(path, clocks),
        "script": _script(fields, path, txn_date, time_estimated),
        "disclaimers": list(DISCLAIMERS),
    }
