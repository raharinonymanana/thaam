"""POST /cases/{caseId}/reminders - enrol a case for email reminders."""
from __future__ import annotations

import os
import re
import secrets
from datetime import datetime, timezone

from botocore.exceptions import ClientError

import reminder_steps
from handlers import common

SCHEDULE_GROUP = os.environ.get("SCHEDULE_GROUP", "")
REMINDER_FUNCTION_ARN = os.environ.get("REMINDER_FUNCTION_ARN", "")
SCHEDULER_ROLE_ARN = os.environ.get("SCHEDULER_ROLE_ARN", "")
ALLOW_DEMO_MODE = os.environ.get("ALLOW_DEMO_MODE", "false")
DEMO_STEP_SECONDS = int(os.environ.get("DEMO_STEP_SECONDS", "60"))

MAX_EMAIL = 254
_EMAIL = re.compile(r"^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$")

MAX_RETRY_ATTEMPTS = 3


def _now():
    """The one clock this handler reads (D113).

    Every fire time and enrolledAt is derived from a single instant, so a
    cadence cannot straddle two different "now"s - and a test can freeze it.
    """
    return datetime.now(timezone.utc)


def _valid_email(value) -> bool:
    return (isinstance(value, str) and 0 < len(value) <= MAX_EMAIL
            and bool(_EMAIL.match(value.strip())))


def delete_schedules(names) -> int:
    """Delete schedules, tolerating ones that have already fired and deleted
    themselves (ActionAfterCompletion DELETE), so no orphans are left behind."""
    deleted = 0
    for name in names:
        try:
            common.scheduler().delete_schedule(Name=name, GroupName=SCHEDULE_GROUP)
            deleted += 1
        except ClientError as err:
            if err.response.get("Error", {}).get("Code") != "ResourceNotFoundException":
                raise
    return deleted


def lambda_handler(event, context):
    case_id = (event.get("pathParameters") or {}).get("caseId")
    if not common.is_valid_case_id(case_id):
        return common.json_response(400, {
            "error": "invalid_case_id", "message": "Case ID is not valid.",
        })
    # Only a well-formed ID reaches this point; invalid ones are never logged.
    ref = common.case_ref(case_id)

    body = common.parse_json_body(event)
    if not isinstance(body, dict):
        common.log_event("enroll", caseRef=ref, status="invalid_body")
        return common.json_response(400, {
            "error": "invalid_body", "message": "Request body must be a JSON object.",
        })
    email = body.get("email")
    if not _valid_email(email):
        common.log_event("enroll", caseRef=ref, status="invalid", field="email")
        return common.json_response(400, {
            "error": "invalid_field", "field": "email",
            "message": "Enter an email address we can send reminders to.",
        })
    email = email.strip()

    demo = body.get("demo") is True
    if demo and ALLOW_DEMO_MODE != "true":
        # Never silently ignore a demo request: the caller would believe the
        # reminders were compressed and wait for mail that comes days later.
        common.log_event("enroll", caseRef=ref, status="demo_forbidden")
        return common.json_response(403, {
            "error": "demo_disabled", "message": "Demo mode is not enabled.",
        })

    item = common.cases_table().get_item(Key={"caseId": case_id}).get("Item")
    if not item:
        common.log_event("enroll", caseRef=ref, status="not_found")
        return common.json_response(404, {"error": "not_found", "message": "Case not found."})
    if item.get("status") != "planned" or not item.get("clocks"):
        common.log_event("enroll", caseRef=ref, status="no_plan")
        return common.json_response(409, {
            "error": "no_plan", "message": "Build the plan before setting up reminders.",
        })

    now = _now()
    expires_at = item.get("expiresAt")
    steps = reminder_steps.build_steps(
        clocks=item["clocks"],
        now=now,
        expires_at=int(expires_at) if expires_at else None,
        demo=demo,
        demo_step_seconds=DEMO_STEP_SECONDS,
    )

    # Idempotent: drop whatever is already scheduled before recreating, so a
    # second enrolment never leaves orphaned schedules behind.
    previous = [s.get("scheduleName") for s in (item.get("reminders") or {}).get("steps", [])
                if s.get("scheduleName")]
    replaced = delete_schedules(previous)

    unsub_token = secrets.token_hex(16)
    for entry in steps:
        if entry["status"] != "scheduled":
            common.log_event("reminder_step_skipped", caseRef=ref, step=entry["step"],
                             reason=entry["reason"])
            continue
        entry["scheduleName"] = reminder_steps.schedule_name(ref, entry["step"])
        common.scheduler().create_schedule(
            Name=entry["scheduleName"],
            GroupName=SCHEDULE_GROUP,
            ScheduleExpression=reminder_steps.at_expression(entry["fireAt"]),
            ScheduleExpressionTimezone="UTC",
            FlexibleTimeWindow={"Mode": "OFF"},
            ActionAfterCompletion="DELETE",
            Target={
                "Arn": REMINDER_FUNCTION_ARN,
                "RoleArn": SCHEDULER_ROLE_ARN,
                "Input": reminder_steps.schedule_input(case_id, entry["step"]),
                "RetryPolicy": {"MaximumRetryAttempts": MAX_RETRY_ATTEMPTS},
            },
        )

    common.cases_table().update_item(
        Key={"caseId": case_id},
        UpdateExpression="SET #reminders = :reminders",
        ExpressionAttributeNames={"#reminders": "reminders"},
        ExpressionAttributeValues={":reminders": {
            "status": "active",
            "email": email,
            "enrolledAt": now.isoformat(timespec="seconds"),
            "demo": demo,
            "unsubToken": unsub_token,
            "steps": steps,
        }},
    )

    live = reminder_steps.scheduled(steps)
    common.log_event("enroll", caseRef=ref, status="active", demo=demo,
                     stepCount=len(live), skippedCount=len(steps) - len(live),
                     replacedCount=replaced)
    # The unsubscribe token is never echoed: it only ever leaves here by email.
    return common.json_response(201, {
        "enrolled": True,
        "steps": [{"step": s["step"], "fireAt": s["fireAt"], "urgent": s["urgent"]}
                  for s in live],
        "skipped": [{"step": s["step"], "reason": s["reason"]}
                    for s in steps if s["status"] == "skipped"],
    })
