"""POST /cases/{caseId}/plan - confirmed fields + one answer -> action plan."""
from __future__ import annotations

import re
from datetime import date, datetime, timezone

from handlers import common
from plan_builder import SHARED_CREDENTIALS, build_plan
from working_days import IST

PLANNABLE_STATUSES = {"extracted", "planned"}
MAX_TEXT = 100

_AMOUNT = re.compile(r"^\d+(\.\d{1,2})?$")
_UTR = re.compile(r"^\d{12}$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$")
# Masked only: a full account number is rejected, never stored.
_ACCOUNT_MASKED = re.compile(r"^XX\d{1,4}$")

# Only these keys are stored; anything else the client sends is dropped.
FIELD_KEYS = ("amount", "utr", "txn_date", "txn_time", "account_masked",
              "payee_vpa", "payee_phone", "bank")


def _bad(field: str, message: str) -> dict:
    return common.json_response(400, {"error": "invalid_field", "field": field, "message": message})


def validate_fields(raw, today: date):
    """Return (clean_fields, None) or (None, (field_name, message))."""
    if not isinstance(raw, dict):
        return None, ("fields", "fields must be an object.")
    fields = {}
    for key in FIELD_KEYS:
        value = raw.get(key)
        if value is not None and not isinstance(value, str):
            return None, (key, f"{key} must be text.")
        fields[key] = (value.strip() or None) if value is not None else None

    if not fields["amount"] or not _AMOUNT.match(fields["amount"]):
        return None, ("amount", "Enter the amount as a number, e.g. 49999.00.")
    if fields["utr"] and not _UTR.match(fields["utr"]):
        return None, ("utr", "The UTR must be exactly 12 digits.")
    try:
        if not fields["txn_date"] or not _DATE.match(fields["txn_date"]):
            raise ValueError
        txn_date = date.fromisoformat(fields["txn_date"])
    except ValueError:
        return None, ("txn_date", "Enter the transaction date as YYYY-MM-DD.")
    if txn_date > today:
        return None, ("txn_date", "The transaction date cannot be in the future.")
    if fields["txn_time"] and not _TIME.match(fields["txn_time"]):
        return None, ("txn_time", "Enter the time as HH:MM or HH:MM:SS.")
    if fields["account_masked"] and not _ACCOUNT_MASKED.match(fields["account_masked"]):
        return None, ("account_masked",
                      "Enter only the last 4 digits of the account, e.g. XX1234. "
                      "Never enter your full account number.")
    for key in ("payee_vpa", "payee_phone", "bank"):
        if fields[key] and len(fields[key]) > MAX_TEXT:
            return None, (key, f"{key} must be at most {MAX_TEXT} characters.")
    return fields, None


def lambda_handler(event, context):
    case_id = (event.get("pathParameters") or {}).get("caseId")
    if not common.is_valid_case_id(case_id):
        return common.json_response(400, {
            "error": "invalid_case_id", "message": "Case ID is not valid.",
        })
    # Only a well-formed ID reaches this point; invalid ones are never logged.
    ref = common.case_ref(case_id)

    item = common.cases_table().get_item(Key={"caseId": case_id}).get("Item")
    if not item:
        common.log_event("plan", caseRef=ref, status="not_found")
        return common.json_response(404, {"error": "not_found", "message": "Case not found."})
    if item.get("status") not in PLANNABLE_STATUSES:
        common.log_event("plan", caseRef=ref, status="wrong_status")
        return common.json_response(409, {
            "error": "wrong_status",
            "message": "Upload and extract the screenshot before building a plan.",
        })

    body = common.parse_json_body(event)
    if not isinstance(body, dict):
        common.log_event("plan", caseRef=ref, status="invalid_body")
        return common.json_response(400, {
            "error": "invalid_body", "message": "Request body must be a JSON object.",
        })
    shared = body.get("sharedCredentials")
    if shared not in SHARED_CREDENTIALS:
        common.log_event("plan", caseRef=ref, status="invalid", field="sharedCredentials")
        return _bad("sharedCredentials", "sharedCredentials must be yes, no or not_sure.")

    reported_at = datetime.now(timezone.utc).astimezone(IST)
    fields, error = validate_fields(body.get("fields"), reported_at.date())
    if error:
        # Log the field name only, never the value.
        common.log_event("plan", caseRef=ref, status="invalid", field=error[0])
        return _bad(*error)

    plan = build_plan(fields, shared, reported_at=reported_at, now=reported_at)

    # The script is rebuilt from confirmedFields when needed, so it is not stored.
    common.cases_table().update_item(
        Key={"caseId": case_id},
        UpdateExpression=("SET #confirmedFields = :confirmedFields, "
                          "#sharedCredentials = :sharedCredentials, #path = :path, "
                          "#clocks = :clocks, #status = :status, #plannedAt = :plannedAt"),
        ExpressionAttributeNames={
            "#confirmedFields": "confirmedFields", "#sharedCredentials": "sharedCredentials",
            "#path": "path", "#clocks": "clocks", "#status": "status", "#plannedAt": "plannedAt",
        },
        ExpressionAttributeValues={
            ":confirmedFields": fields,
            ":sharedCredentials": shared,
            ":path": plan["path"],
            ":clocks": plan["clocks"],
            ":status": "planned",
            ":plannedAt": reported_at.isoformat(timespec="seconds"),
        },
    )

    common.log_event("plan", caseRef=ref, status="planned", path=plan["path"],
                     stepCount=len(plan["steps"]))
    return common.json_response(200, {
        "caseId": case_id,
        "path": plan["path"],
        "notSure": plan["notSure"],
        "clocks": plan["clocks"],
        "steps": plan["steps"],
        "script": plan["script"],
        "disclaimers": plan["disclaimers"],
    })
