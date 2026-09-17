"""Turn the text lines of a bank SMS / UPI screenshot into complaint fields.

Pure Python, no AWS calls: the Lambda feeds it Textract's LINE blocks.
Every value is a *suggestion* - the victim reviews and edits it in the app.
"""
from __future__ import annotations

import re
from datetime import date

REQUIRED_FIELDS = ("amount", "utr", "txn_date")

_TRAILING_JUNK = ".,;:!?)]}'\""

_AMOUNT = re.compile(
    r"(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)", re.IGNORECASE
)
_UTR_LABELLED = re.compile(
    r"(?:utr|rrn|upi\s*ref(?:erence)?|ref(?:erence)?)"
    r"(?:\s*(?:no|number|id))?[\s.:#-]*([0-9]{12})(?!\d)",
    re.IGNORECASE,
)
_TWELVE_DIGITS = re.compile(r"(?<!\d)([0-9]{12})(?!\d)")
# UPI handle: name@psp, where psp has no dot (that would be an email).
_VPA = re.compile(r"(?<![\w.])([a-z0-9][a-z0-9._-]{1,254}@[a-z][a-z0-9]{1,63})(?![\w@])(?!\.[a-z])", re.IGNORECASE)
_MOBILE = re.compile(r"(?<![\d-])(?:\+91[\s-]?|0)?([6-9][0-9]{9})(?![\d-])")
_ACCOUNT = re.compile(r"\ba/?c(?:count)?\s*(?:no\.?)?\s*[:#]?\s*([x*]*[0-9]{3,18})\b", re.IGNORECASE)
_DATE_NUMERIC = re.compile(r"\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b")
_DATE_MONTH = re.compile(r"\b(\d{1,2})[-\s]?([a-z]{3})[a-z]*[-\s,]?\s?(\d{2}|\d{4})\b", re.IGNORECASE)
_TIME = re.compile(r"\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b")
_SENDER_ID = re.compile(r"^[A-Z]{2}-[A-Z0-9]{5,8}\b")
_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}
_DEBIT_WORDS = re.compile(r"\b(debited|debit|sent|paid|withdrawn|transferred)\b", re.IGNORECASE)
_CREDIT_WORDS = re.compile(r"\b(credited|credit|received)\b", re.IGNORECASE)

# Keyword -> display name. Longest keywords are tried first.
_BANKS = {
    "state bank of india": "State Bank of India", "sbi": "State Bank of India",
    "hdfc": "HDFC Bank", "icici": "ICICI Bank", "axis bank": "Axis Bank",
    "kotak": "Kotak Mahindra Bank", "punjab national": "Punjab National Bank",
    "pnb": "Punjab National Bank", "bank of baroda": "Bank of Baroda",
    "canara": "Canara Bank", "union bank": "Union Bank of India",
    "indusind": "IndusInd Bank", "yes bank": "Yes Bank", "idfc": "IDFC FIRST Bank",
    "bank of india": "Bank of India", "indian bank": "Indian Bank",
    "federal bank": "Federal Bank", "sample bank": "Sample Bank",
}


def clean(value: str) -> str:
    """Strip whitespace and trailing punctuation OCR tends to add."""
    return value.strip().rstrip(_TRAILING_JUNK).strip()


def mask_account(raw: str) -> str:
    """Keep only the last 4 digits: '123456789012' -> 'XX9012'."""
    digits = re.sub(r"\D", "", raw)
    return "XX" + digits[-4:] if len(digits) >= 4 else "XX" + digits


def _parse_amount(text: str) -> str | None:
    debit_pos = _DEBIT_WORDS.search(text)
    matches = list(_AMOUNT.finditer(text))
    if not matches:
        return None
    if debit_pos:  # the amount closest to the word "debited" wins
        matches.sort(key=lambda m: abs(m.start() - debit_pos.start()))
    value = clean(matches[0].group(1)).replace(",", "")
    try:
        return f"{float(value):.2f}"
    except ValueError:
        return None


def _parse_utr(text: str) -> str | None:
    m = _UTR_LABELLED.search(text) or _TWELVE_DIGITS.search(text)
    return m.group(1) if m else None


def _to_iso(day: int, month: int, year: int) -> str | None:
    if year < 100:
        year += 2000
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def _parse_date(text: str) -> str | None:
    for m in _DATE_NUMERIC.finditer(text):  # Indian order: day first
        iso = _to_iso(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        if iso:
            return iso
    for m in _DATE_MONTH.finditer(text):
        month = _MONTHS.get(m.group(2).lower()[:3])
        if month:
            iso = _to_iso(int(m.group(1)), month, int(m.group(3)))
            if iso:
                return iso
    return None


def _parse_time(text: str) -> str | None:
    times = list(_TIME.finditer(text))
    if not times:
        return None
    with_seconds = [m for m in times if m.group(3)]
    m = with_seconds[0] if with_seconds else times[0]
    return f"{int(m.group(1)):02d}:{m.group(2)}:{m.group(3) or '00'}"


def _parse_bank(text: str) -> str | None:
    lowered = text.lower()
    for keyword in sorted(_BANKS, key=len, reverse=True):
        if re.search(rf"\b{re.escape(keyword)}\b", lowered):
            return _BANKS[keyword]
    return None


def parse_lines(lines: list[str]) -> dict:
    """Extract complaint fields from OCR lines. Never raises on odd input."""
    lines = [ln.strip() for ln in lines if ln and ln.strip()]
    sender_id = next((m.group(0) for ln in lines[:2] if (m := _SENDER_ID.match(ln))), None)
    text = " ".join(lines)

    vpa = next((clean(m.group(1)).lower() for m in _VPA.finditer(text)), None)
    mobile = next((m.group(1) for m in _MOBILE.finditer(text)), None)
    account = _ACCOUNT.search(text)

    if _DEBIT_WORDS.search(text):
        direction = "debit"
    elif _CREDIT_WORDS.search(text):
        direction = "credit"
    else:
        direction = None

    fields = {
        "amount": _parse_amount(text),
        "utr": _parse_utr(text),
        "txn_date": _parse_date(text),
        "txn_time": _parse_time(text),
        "account_masked": mask_account(account.group(1)) if account else None,
        "payee_vpa": vpa,
        "payee_phone": mobile,
        "bank": _parse_bank(text),
        "sender_id": sender_id,
        "direction": direction,
    }
    fields["missing"] = [f for f in REQUIRED_FIELDS if not fields[f]]
    return fields
