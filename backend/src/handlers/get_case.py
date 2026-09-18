"""GET /cases/{caseId} - the case as the victim left it, read-only (D110).

Nothing here mutates: the plan is REBUILT from the confirmed fields and the
stored plannedAt, never re-derived from "now". That keeps every deadline
byte-identical to the original POST /plan response, while goldenHour's
minutesLeft/expired move with the current time, which is what a returning
victim needs to see.

The response deliberately omits the reminder email address and the unsubscribe
token: the case ID is enough to open this endpoint, so anything it returns is
readable by anyone holding the link, and neither of those has to be.
"""
from __future__ import annotations

from datetime import datetime, timezone

from handlers import common
from handlers.family import MAX_SENDS
from handlers.plan import FIELD_KEYS
from plan_builder import SHARED_CREDENTIALS, build_plan
from working_days import IST

# A GET carrying personal data must not sit in a browser or proxy cache, where
# the next person on a shared device would find it.
NO_STORE = {"Cache-Control": "no-store"}

NOT_FOUND = {"error": "not_found", "message": "Case not found."}


def _response(status: int, body) -> dict:
    return common.json_response(status, body, headers=NO_STORE)


# Why a step was not scheduled. Whitelisted rather than passed through: these
# two are wording we have written for a victim to read, and a reason added
# later would otherwise reach the screen as a raw internal string.
SKIP_REASONS = ("deadline_passed", "case_expiring")


def _reminders(item: dict):
    """The reminder cadence: what was scheduled and what has already been sent.

    Deliberately partial - email, unsubToken, scheduleName, realDueDate and
    enrolledAt all stay in the table. The case ID is the only credential this
    endpoint asks for, so anything returned here is readable by whoever holds
    the link, and none of those has to be.
    """
    reminders = item.get("reminders")
    if not reminders:
        return None
    return {
        "status": reminders.get("status"),
        "demo": bool(reminders.get("demo")),
        "steps": [{"step": s.get("step"), "fireAt": s.get("fireAt"),
                   "status": s.get("status"), "sentAt": s.get("sentAt"),
                   "reason": s.get("reason") if s.get("reason") in SKIP_REASONS else None}
                  for s in reminders.get("steps") or []],
    }


def lambda_handler(event, context):
    case_id = (event.get("pathParameters") or {}).get("caseId")
    if not common.is_valid_case_id(case_id):
        return _response(400, {
            "error": "invalid_case_id", "message": "Case ID is not valid.",
        })
    # Only a well-formed ID reaches this point; invalid ones are never logged.
    ref = common.case_ref(case_id)

    now = datetime.now(timezone.utc).astimezone(IST)
    item = common.cases_table().get_item(Key={"caseId": case_id}).get("Item")
    if not item:
        common.log_event("get_case", caseRef=ref, status="not_found")
        return _response(404, NOT_FOUND)

    expires_at = item.get("expiresAt")
    if expires_at is not None and int(expires_at) <= now.timestamp():
        # The TTL deletes lazily, up to ~48h late. An expired case has to look
        # deleted, or the 90-day promise holds only on paper.
        common.log_event("get_case", caseRef=ref, status="expired")
        return _response(404, NOT_FOUND)

    fields = item.get("confirmedFields")
    shared = item.get("sharedCredentials")
    planned_at = item.get("plannedAt")
    if (item.get("status") != "planned" or not fields or not planned_at
            or shared not in SHARED_CREDENTIALS):
        common.log_event("get_case", caseRef=ref, status="no_plan")
        return _response(409, {
            "error": "no_plan", "message": "Build the plan before opening the case.",
        })

    plan = build_plan(dict(fields), shared,
                      reported_at=datetime.fromisoformat(planned_at), now=now)

    common.log_event("get_case", caseRef=ref, status="ok", path=plan["path"],
                     enrolled=bool(item.get("reminders")))
    return _response(200, {
        "caseId": case_id,
        "path": plan["path"],
        "notSure": plan["notSure"],
        "clocks": plan["clocks"],
        "steps": plan["steps"],
        "script": plan["script"],
        "disclaimers": plan["disclaimers"],
        "fields": {key: fields.get(key) for key in FIELD_KEYS},
        "plannedAt": planned_at,
        "reminders": _reminders(item),
        "family": {
            "sendsRemaining": max(MAX_SENDS - int(item.get("familySends") or 0), 0),
        },
    })
