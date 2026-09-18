"""Render the one-off "share my next steps" email. Pure Python, no AWS calls.

Same construction-by-design as reminder_email: render() is given only action
step titles, deadline labels with dates, and a display name. It never receives
the case fields, so it is structurally incapable of printing an amount, a UTR,
a UPI ID, a masked account or a bank name - a helper's mailbox is not covered
by the victim's 90-day deletion promise.

There is deliberately NO case link either: the case ID is the victim's only
credential, and anyone holding it can read and change the whole case. A third
party gets the steps, not the keys.
"""
from __future__ import annotations

from datetime import datetime
from html import escape

from plan_builder import spoken_date
from reminder_email import FOOTER, SENDER_NAME  # one copy of the disclaimer

SUBJECT = "Thaam: the next steps for a cyber fraud complaint"
INTRO = ("Someone using Thaam asked us to share their next steps with you, so you "
         "can help them work through the list.")
# The victim's own screen shows the 1930 call script under these steps; this
# email never can, because the script contains the amount, the UTR and the payee
# (D103). So the details below are rewritten for a helper, and nothing here
# points at wording that is not in this email.
WORDING = ("They have the exact wording to read out in their Thaam case - "
           "ask them to open it.")
ONE_OFF = "This is a one-off email. Thaam will not email you again about it."
MAX_NAME = 60

# Step id -> what the helper should do. A step with no entry here is listed by
# title alone, so a step added later cannot leak victim-facing copy into a
# helper's mailbox. {date} is filled from the clocks, never from the fields.
FAMILY_DETAILS = {
    "call_1930": "Call the cyber crime helpline 1930 with them.",
    "file_ncrp": "Help them file the complaint at cybercrime.gov.in.",
    "keep_ack": "Write down the acknowledgement number they are given.",
    "block_payments": "Ask their bank to block the card or UPI.",
    "bank_letter": "Make sure the written complaint reaches their bank by {date}.",
    "fir": "Go with them to the nearest police station to file an FIR, "
           "taking the acknowledgement number.",
    "chakshu": "Report the scammer's number on Chakshu, at sancharsaathi.gov.in.",
}
# Step id -> a title written for the helper. The plan's own titles address the
# victim ("Block YOUR card", "...to YOUR bank"), which in a helper's inbox reads
# as an instruction about the helper's own bank account. Only these two say
# "your"; every other step keeps the plan's title, so this stays a small
# override rather than a second set of wording to maintain.
FAMILY_TITLES = {
    "block_payments": "Help block their card or UPI",
    "bank_letter": "Get the written complaint to their bank",
}

BANK_LETTER_CLOCK = "bankReport"

# Clock -> what the date means, in words a helper can act on.
DEADLINE_LABELS = (
    ("bankReport", "deadline", "Written complaint to the bank due by"),
    ("limitedLiability", "until", "Liability cap applies until"),
    ("shadowCredit", "by", "Provisional credit from the bank due by"),
    ("ombudsman", "eligibleFrom", "RBI Ombudsman can be approached from"),
    ("resolution", "by", "Bank should resolve the complaint by"),
)


def deadlines(clocks: dict) -> list[dict]:
    """[{label, date}] in IST, built from the clocks alone."""
    out = []
    for name, key, label in DEADLINE_LABELS:
        value = (clocks or {}).get(name, {}).get(key)
        if value:
            out.append({"clock": name, "label": label,
                        "date": spoken_date(datetime.fromisoformat(value).date())})
    return out


def greeting(to_name: str | None) -> str:
    name = (to_name or "").strip()[:MAX_NAME]
    return f"Hello {name}," if name else "Hello,"


def family_steps(steps: list[dict], deadline_lines: list[dict]) -> list[dict]:
    """[{title, detail}] rewritten for a helper: the plan's titles except where
    FAMILY_TITLES overrides one, and the details from FAMILY_DETAILS, so nothing
    refers to the script or the screen the helper cannot see."""
    dates = {d["clock"]: d["date"] for d in deadline_lines if d.get("clock")}
    out = []
    for step in steps:
        step_id = step.get("id")
        detail = FAMILY_DETAILS.get(step_id)
        if detail and "{date}" in detail:
            due = dates.get(BANK_LETTER_CLOCK)
            detail = detail.format(date=due) if due else None
        out.append({"title": FAMILY_TITLES.get(step_id, step["title"]), "detail": detail})
    return out


def render(steps: list[dict], deadline_lines: list[dict], to_name: str | None = None) -> dict:
    """Return {subject, text, html}.

    steps is the output of plan_builder.action_steps; deadline_lines is the
    output of deadlines(). Nothing else may be passed in.
    """
    steps = family_steps(steps, deadline_lines)
    step_lines = [f"{i}. {s['title']}" + (f" - {s['detail']}" if s["detail"] else "")
                  for i, s in enumerate(steps, start=1)]
    date_lines = [f"{d['label']} {d['date']}" for d in deadline_lines]

    text = "\n".join([
        greeting(to_name),
        "",
        INTRO,
        "",
        WORDING,
        "",
        "What needs doing:",
        *step_lines,
        *(["", "Dates that matter:", *date_lines] if date_lines else []),
        "",
        FOOTER,
        ONE_OFF,
    ])

    # Minimal HTML: no images, no tracking pixel, no external CSS, no links
    # except the government pages the steps themselves point at.
    items = "".join(
        f"<li>{escape(s['title'])}" + (f" - {escape(s['detail'])}" if s["detail"] else "")
        + "</li>" for s in steps)
    dates = "".join(
        f"<li>{escape(d['label'])} {escape(d['date'])}</li>" for d in deadline_lines)
    html = (
        "<html><body>"
        f"<p>{escape(greeting(to_name))}</p>"
        f"<p>{escape(INTRO)}</p>"
        f"<p>{escape(WORDING)}</p>"
        f"<p>What needs doing:</p><ol>{items}</ol>"
        + (f"<p>Dates that matter:</p><ul>{dates}</ul>" if dates else "")
        + f"<p>{escape(FOOTER)}</p>"
        f"<p>{escape(ONE_OFF)}</p>"
        "</body></html>"
    )
    return {"subject": SUBJECT, "text": text, "html": html}


def sender(address: str) -> str:
    return f"{SENDER_NAME} <{address}>"
