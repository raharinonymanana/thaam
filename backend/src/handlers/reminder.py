"""Invoked by EventBridge Scheduler with {"caseId", "step"}: send one reminder."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from urllib.parse import urlencode

import reminder_email
from handlers import common

SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "")
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
API_BASE_URL = os.environ.get("API_BASE_URL", "").rstrip("/")


def case_url(case_id: str) -> str:
    return f"{PUBLIC_BASE_URL}/case/{case_id}"


def unsubscribe_url(case_id: str, token: str) -> str:
    return f"{API_BASE_URL}/r/unsubscribe?" + urlencode({"c": case_id, "t": token})


def _skip(ref: str, step: str, reason: str) -> dict:
    # Unenrolment can race a schedule that is already firing, and the TTL can
    # delete the case first. Neither is an error worth retrying.
    common.log_event("reminder_skipped", caseRef=ref, step=step, reason=reason)
    return {"sent": False, "reason": reason}


def lambda_handler(event, context):
    case_id = (event or {}).get("caseId")
    step = (event or {}).get("step")
    if not common.is_valid_case_id(case_id) or step not in reminder_email.SUBJECTS:
        # No caseRef here: an invalid ID is never hashed or logged.
        common.log_event("reminder_skipped", reason="invalid_input")
        return {"sent": False, "reason": "invalid_input"}
    ref = common.case_ref(case_id)

    item = common.cases_table().get_item(Key={"caseId": case_id}).get("Item")
    if not item:
        return _skip(ref, step, "case_missing")
    reminders = item.get("reminders") or {}
    if reminders.get("status") != "active":
        return _skip(ref, step, "not_active")
    if not reminders.get("email"):
        return _skip(ref, step, "no_email")

    index, entry = next(((i, s) for i, s in enumerate(reminders.get("steps", []))
                         if s.get("step") == step), (None, None))
    if entry is None:
        return _skip(ref, step, "unknown_step")
    if entry.get("sentAt"):
        return _skip(ref, step, "already_sent")

    message = reminder_email.render(
        step=step,
        real_due_date=entry["realDueDate"],
        case_url=case_url(case_id),
        unsubscribe_url=unsubscribe_url(case_id, reminders["unsubToken"]),
        path=item.get("path", "unauthorised"),
        urgent=bool(entry.get("urgent")),
    )
    common.sesv2().send_email(
        FromEmailAddress=f'{reminder_email.SENDER_NAME} <{SENDER_EMAIL}>',
        Destination={"ToAddresses": [reminders["email"]]},
        Content={"Simple": {
            "Subject": {"Data": message["subject"], "Charset": "UTF-8"},
            "Body": {
                "Text": {"Data": message["text"], "Charset": "UTF-8"},
                "Html": {"Data": message["html"], "Charset": "UTF-8"},
            },
        }},
    )

    sent_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    common.cases_table().update_item(
        Key={"caseId": case_id},
        UpdateExpression=f"SET #reminders.#steps[{index}].#sentAt = :sentAt",
        ExpressionAttributeNames={
            "#reminders": "reminders", "#steps": "steps", "#sentAt": "sentAt",
        },
        ExpressionAttributeValues={":sentAt": sent_at},
    )

    common.log_event("reminder_sent", caseRef=ref, step=step,
                     urgent=bool(entry.get("urgent")))
    return {"sent": True, "step": step}
