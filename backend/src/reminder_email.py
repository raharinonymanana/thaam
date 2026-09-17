"""Render one reminder email. Pure Python, no AWS calls.

D88 redaction rule, enforced by construction: an email carries ONLY the step's
one-line nudge, the real calendar date it refers to, a link to the case and the
unsubscribe link. No payee name, no UPI ID, no phone number, no amount, no bank
reference number, no acknowledgement number - a mailbox is not as private as
the case page, and an inbox lives far longer than the 90-day case record.
Renderers here are given those four pieces only; they never see the fields.
"""
from __future__ import annotations

from datetime import date
from html import escape

from plan_builder import spoken_date

SENDER_NAME = "Thaam"

# Anchored copy names the consequence, not just the date.
NUDGES = {
    "bank_ack": "Report to your bank in writing by {date} to keep zero liability.",
    "liability_window": "After {date} the liability cap no longer applies. "
                        "Escalate now if unresolved.",
    "shadow_credit": "Your bank should have credited the amount provisionally by {date}.",
    "ombudsman": "From today you can take this to the RBI Ombudsman.",
    "closeout": "Final check-in. Your case record expires shortly.",
    "portal_status": "Check your complaint status on the portal.",
}
# The authorised path has no liability cap to lose, so its wording differs.
NUDGES_AUTHORISED = {
    "bank_ack": "Confirm in writing that your bank and your 1930 complaint "
                "are both on record.",
}

SUBJECTS = {
    "bank_ack": "Thaam: your bank deadline",
    "liability_window": "Thaam: liability window closing",
    "shadow_credit": "Thaam: provisional credit due",
    "ombudsman": "Thaam: you can escalate now",
    "closeout": "Thaam: final check-in",
    "portal_status": "Thaam: check your complaint status",
}

URGENT_PREFIX = "Less than a day left."
FOOTER = ("Thaam is not a government service and is not affiliated with I4C, NCRP, "
          "RBI or any bank. This is guidance, not legal advice.")


def nudge(step: str, real_due_date: str, path: str = "unauthorised", urgent: bool = False) -> str:
    template = NUDGES_AUTHORISED.get(step) if path == "authorised" else None
    template = template or NUDGES[step]
    line = template.format(date=spoken_date(date.fromisoformat(real_due_date)))
    return f"{URGENT_PREFIX} {line}" if urgent else line


def render(step: str, real_due_date: str, case_url: str, unsubscribe_url: str,
           path: str = "unauthorised", urgent: bool = False) -> dict:
    """Return {subject, text, html} for one reminder."""
    line = nudge(step, real_due_date, path, urgent)
    text = "\n".join([
        line,
        "",
        f"Your case: {case_url}",
        "",
        FOOTER,
        f"Stop these reminders: {unsubscribe_url}",
    ])
    # Minimal HTML: no images, no tracking pixel, no external CSS.
    html = (
        "<html><body>"
        f"<p>{escape(line)}</p>"
        f'<p><a href="{escape(case_url, quote=True)}">Open your case</a></p>'
        f"<p>{escape(FOOTER)}</p>"
        f'<p><a href="{escape(unsubscribe_url, quote=True)}">Stop these reminders</a></p>'
        "</body></html>"
    )
    return {"subject": SUBJECTS[step], "text": text, "html": html}
