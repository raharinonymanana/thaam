"""Build the victim's action plan: deadlines, ordered steps, 1930 call script.

Pure Python, no AWS calls. Every deadline is an estimate (see working_days).

SSML safety: the audio script is SSML (XML) sent to Polly, and several values
in it come from the user (bank name, UPI ID, amount...). An unescaped value
like '</prosody><break time="10s"/>' would inject markup: long silences,
different speech, or invalid SSML that breaks the audio. Every user-supplied
value therefore goes through xml.sax.saxutils.escape BEFORE any markup of our
own (prosody, break) is added around it. Values are only ever placed in element
text, never in attributes, so escaping &, < and > is sufficient.
"""
from __future__ import annotations

import math
import re
from datetime import date, datetime, time, timedelta
from string import Formatter
from xml.sax.saxutils import escape

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
UNKNOWN_SPOKEN = {"en": "not known", "hi": "पता नहीं"}

_MONTHS = {
    "en": ["January", "February", "March", "April", "May", "June", "July",
           "August", "September", "October", "November", "December"],
    "hi": ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई",
           "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"],
}

# The script, one sentence per entry. The text script joins them with spaces;
# the SSML script joins them with pauses. Only {placeholders} are user data.
_SCRIPT_SENTENCES = {
    "en": [
        "Hello, I want to report a cyber fraud.",
        "Rupees {amount} was debited from my {bank} account ending {last4} on {date} at {time}.",
        "The UPI reference number, the UTR, is {utr}.",
        "The money went to {payee}.",
        "{path_line}",
    ],
    "hi": [
        "नमस्ते, मुझे साइबर धोखाधड़ी की शिकायत दर्ज करानी है।",
        "{date} को {time} बजे मेरे {bank} खाते से, जिसके आख़िरी चार अंक {last4} हैं, {amount} रुपये कटे हैं।",
        "यूपीआई रेफ़रेंस नंबर, यानी यूटीआर, {utr} है।",
        "पैसे {payee} को गए हैं।",
        "{path_line}",
    ],
}

# Last sentence: on screen the victim fills the brackets in; in audio they
# are told to say it themselves.
_CLOSING_TEXT = {
    "en": "My name is [your name] and my mobile number is [your number].",
    "hi": "मेरा नाम [अपना नाम] है और मेरा मोबाइल नंबर [अपना नंबर] है।",
}
_CLOSING_SPOKEN = {
    "en": "Then say your name and your mobile number.",
    "hi": "फिर अपना नाम और मोबाइल नंबर बताइए।",
}

_UPI_SPOKEN = {"en": (" at ", " dot "), "hi": (" ऐट ", " डॉट ")}

_SENTENCE_BREAK = '<break time="400ms"/>'
_DIGIT_BREAK = '<break time="150ms"/>'
_DIGIT_GROUP_GAP = '<break time="700ms"/>'

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


def spoken_date(d: date, lang: str = "en") -> str:
    """date(2026, 9, 19) -> '19 September 2026'."""
    return f"{d.day} {_MONTHS[lang][d.month - 1]} {d.year}"


def action_steps(path: str, clocks: dict) -> list[dict]:
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
                      + spoken_date(datetime.fromisoformat(clocks["bankReport"]["deadline"]).date()),
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


# Script segments for SSML. A value is a list of segments:
#   ("normal", markup)  spoken at 90%, merged with neighbouring normal text
#   ("slow", markup)    its own <prosody rate="80%"> block (digits, date, time)
#   ("gap", markup)     bare pause between two digit groups of the same number
def _normal(markup: str) -> list[tuple[str, str]]:
    return [("normal", markup)]


def _slow_text(value: str) -> list[tuple[str, str]]:
    return [("slow", escape(value))]


def _slow_digits(digits: str, group: int) -> list[tuple[str, str]]:
    """Digits one by one with short pauses, groups separated by a longer pause."""
    segments = []
    for i, part in enumerate(space_digits(digits, group).split(" ")):
        if i:
            segments.append(("gap", _DIGIT_GROUP_GAP))
        segments.append(("slow", _DIGIT_BREAK.join(escape(d) for d in part)))
    return segments


def _text_values(fields: dict, path: str, lang: str) -> dict:
    """Placeholder values for the on-screen script (plain text)."""
    unknown = UNKNOWN[lang]
    _, time_estimated = _parse_time(fields.get("txn_time"))
    account_digits = re.sub(r"\D", "", fields.get("account_masked") or "")
    amount, utr = fields.get("amount"), fields.get("utr")
    vpa, phone = fields.get("payee_vpa"), fields.get("payee_phone")
    if vpa:
        payee = vpa
    elif phone:
        payee = space_digits(phone, 5) if re.fullmatch(r"\d{10}", phone) else phone
    else:
        payee = unknown
    return {
        "amount": format_inr(amount) if amount else unknown,
        "bank": fields.get("bank") or unknown,
        "last4": account_digits[-4:] if account_digits else unknown,
        "date": spoken_date(date.fromisoformat(fields["txn_date"]), lang),
        "time": unknown if time_estimated else fields["txn_time"][:5],
        "utr": space_digits(utr) if utr else unknown,
        "payee": payee,
        "path_line": _PATH_LINE[path][lang],
    }


def _ssml_values(fields: dict, path: str, lang: str) -> dict:
    """Placeholder values for the audio script, as segment lists.

    Every user-supplied value is escaped (see module docstring) before any
    markup of our own is added around it.
    """
    unknown = _normal(UNKNOWN_SPOKEN[lang])
    _, time_estimated = _parse_time(fields.get("txn_time"))
    account_digits = re.sub(r"\D", "", fields.get("account_masked") or "")
    amount, utr = fields.get("amount"), fields.get("utr")
    vpa = fields.get("payee_vpa")
    phone_digits = re.sub(r"\D", "", fields.get("payee_phone") or "")

    if amount:
        spoken_amount = format_inr(amount)
        if spoken_amount.endswith(".00"):
            spoken_amount = spoken_amount[:-3]  # "49,999.00" is spoken as "49,999"
        amount_value = _normal(escape(spoken_amount))
    else:
        amount_value = unknown

    if vpa:
        at, dot = _UPI_SPOKEN[lang]
        payee = _normal(escape(vpa.replace("@", at).replace(".", dot)))
    elif phone_digits:
        payee = _slow_digits(phone_digits, 5)
    else:
        payee = unknown

    return {
        "amount": amount_value,
        "bank": _normal(escape(fields["bank"])) if fields.get("bank") else unknown,
        "last4": _slow_digits(account_digits[-4:], 4) if account_digits else unknown,
        "date": _slow_text(spoken_date(date.fromisoformat(fields["txn_date"]), lang)),
        "time": unknown if time_estimated else _slow_text(fields["txn_time"][:5]),
        "utr": _slow_digits(utr, 4) if utr else unknown,
        "payee": payee,
        "path_line": _normal(_PATH_LINE[path][lang]),
    }


def _script(fields: dict, path: str) -> dict:
    scripts = {}
    for lang in ("en", "hi"):
        values = _text_values(fields, path, lang)
        sentences = [s.format(**values) for s in _SCRIPT_SENTENCES[lang]]
        sentences.append(_CLOSING_TEXT[lang])
        scripts[lang] = " ".join(sentences)
    return scripts


def _render_ssml(segments: list[tuple[str, str]]) -> str:
    """Flat sequence of prosody blocks: consecutive normal text is merged into
    one 90% block, each slow item gets its own 80% block, gaps stay bare."""
    out, normal = [], []

    def flush():
        if normal:
            out.append(f'<prosody rate="90%">{"".join(normal)}</prosody>')
            normal.clear()

    for kind, markup in segments:
        if kind == "normal":
            normal.append(markup)
        else:
            flush()
            out.append(f'<prosody rate="80%">{markup}</prosody>' if kind == "slow" else markup)
    flush()
    return "".join(out)


def build_script_ssml(confirmed_fields: dict, path: str, lang: str) -> str:
    """SSML for Polly: the call script with digits, date and time read slowly."""
    if lang not in _SCRIPT_SENTENCES:
        raise ValueError("lang must be en or hi")
    if path not in _PATH_LINE:
        raise ValueError("path must be authorised or unauthorised")
    values = _ssml_values(confirmed_fields, path, lang)
    segments: list[tuple[str, str]] = []
    for i, template in enumerate(_SCRIPT_SENTENCES[lang]):
        if i:
            segments.append(("normal", _SENTENCE_BREAK))
        # Template literals are our own fixed wording; only fields are user data.
        for literal, name, _, _ in Formatter().parse(template):
            if literal:
                segments.append(("normal", literal))
            if name:
                segments.extend(values[name])
    segments.append(("normal", _SENTENCE_BREAK))
    segments.append(("normal", _CLOSING_SPOKEN[lang]))
    return f"<speak>{_render_ssml(segments)}</speak>"


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
        "steps": action_steps(path, clocks),
        "script": _script(fields, path),
        "disclaimers": list(DISCLAIMERS),
    }
