"""POST /cases/{caseId}/family - email one person the victim's next steps, once."""
from __future__ import annotations

import os
import re
from datetime import datetime, timezone

from botocore.exceptions import ClientError

import family_email
from handlers import common
from plan_builder import action_steps

SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "")

# Without a cap this endpoint is an open relay: anyone who can create a case
# could mail arbitrary addresses from a verified sender. Three sends covers a
# spouse, a sibling and one retry.
MAX_SENDS = int(os.environ.get("FAMILY_MAX_SENDS", "3"))

MAX_EMAIL = 254
_EMAIL = re.compile(r"^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$")

SANDBOX_MESSAGE = ("We could not send to that address: this build can only email "
                   "pre-approved addresses. Ask for the address to be approved, or "
                   "read the steps on screen and share them yourself.")


def _valid_email(value) -> bool:
    return (isinstance(value, str) and 0 < len(value) <= MAX_EMAIL
            and bool(_EMAIL.match(value.strip())))


def _reserve_send(case_id: str) -> bool:
    """Count this send before it happens, so two requests cannot both pass the
    cap. Returns False when the case has already used its three sends."""
    try:
        common.cases_table().update_item(
            Key={"caseId": case_id},
            UpdateExpression=("SET #familySends = if_not_exists(#familySends, :zero) + :one, "
                              "#familyLastSentAt = :now"),
            ConditionExpression="attribute_not_exists(#familySends) OR #familySends < :max",
            ExpressionAttributeNames={
                "#familySends": "familySends", "#familyLastSentAt": "familyLastSentAt",
            },
            ExpressionAttributeValues={
                ":zero": 0, ":one": 1, ":max": MAX_SENDS,
                ":now": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            },
        )
        return True
    except ClientError as err:
        if err.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return False
        raise


def _release_send(case_id: str, ref: str) -> None:
    """Give the reserved slot back when no mail went out.

    The reservation exists to stop concurrent abuse, not to charge the caller
    for our own failures, so it is refunded on ANY send failure. A refund that
    itself fails is logged and swallowed: the original error is what matters.
    """
    try:
        common.cases_table().update_item(
            Key={"caseId": case_id},
            UpdateExpression="SET #familySends = #familySends - :one",
            ConditionExpression="#familySends > :zero",
            ExpressionAttributeNames={"#familySends": "familySends"},
            ExpressionAttributeValues={":one": 1, ":zero": 0},
        )
    except Exception:  # noqa: BLE001 - never mask the failure that got us here
        common.log_event("family", caseRef=ref, status="refund_failed")


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
        common.log_event("family", caseRef=ref, status="invalid_body")
        return common.json_response(400, {
            "error": "invalid_body", "message": "Request body must be a JSON object.",
        })
    email = body.get("email")
    if not _valid_email(email):
        common.log_event("family", caseRef=ref, status="invalid", field="email")
        return common.json_response(400, {
            "error": "invalid_field", "field": "email",
            "message": "Enter the email address of the person you want to share this with.",
        })
    email = email.strip()
    to_name = body.get("toName")
    if to_name is not None and (not isinstance(to_name, str)
                                or len(to_name.strip()) > family_email.MAX_NAME):
        common.log_event("family", caseRef=ref, status="invalid", field="toName")
        return common.json_response(400, {
            "error": "invalid_field", "field": "toName",
            "message": f"A name can be at most {family_email.MAX_NAME} characters.",
        })

    # The address is personal data: logs carry only its fingerprint.
    to_ref = common.address_ref(email)

    item = common.cases_table().get_item(Key={"caseId": case_id}).get("Item")
    if not item:
        common.log_event("family", caseRef=ref, toRef=to_ref, status="not_found")
        return common.json_response(404, {"error": "not_found", "message": "Case not found."})
    if item.get("status") != "planned" or not item.get("clocks"):
        common.log_event("family", caseRef=ref, toRef=to_ref, status="no_plan")
        return common.json_response(409, {
            "error": "no_plan", "message": "Build the plan before sharing it.",
        })

    if not _reserve_send(case_id):
        common.log_event("family", caseRef=ref, toRef=to_ref, status="limit_reached",
                         maxSends=MAX_SENDS)
        return common.json_response(429, {
            "error": "limit_reached",
            "message": f"This case has already been shared {MAX_SENDS} times.",
        })

    clocks = item["clocks"]
    # Built from the plan's path and clocks only - the case fields are never
    # passed to the renderer, so they cannot reach a third party's mailbox.
    message = family_email.render(
        steps=action_steps(item.get("path", "unauthorised"), clocks),
        deadline_lines=family_email.deadlines(clocks),
        to_name=to_name,
    )
    try:
        common.sesv2().send_email(
            FromEmailAddress=family_email.sender(SENDER_EMAIL),
            Destination={"ToAddresses": [email]},
            Content={"Simple": {
                "Subject": {"Data": message["subject"], "Charset": "UTF-8"},
                "Body": {
                    "Text": {"Data": message["text"], "Charset": "UTF-8"},
                    "Html": {"Data": message["html"], "Charset": "UTF-8"},
                },
            }},
        )
    except Exception as err:  # noqa: BLE001 - refund first, then let it through
        # Any failure here means nothing was sent: AccessDenied, a throttle and
        # a timeout must not burn one of the case's three slots either.
        _release_send(case_id, ref)
        code = (err.response.get("Error", {}).get("Code")
                if isinstance(err, ClientError) else None)
        if code == "MessageRejected":
            common.log_event("family", caseRef=ref, toRef=to_ref, status="rejected",
                             sesCode=code)
            return common.json_response(422, {
                "error": "address_not_approved", "message": SANDBOX_MESSAGE,
            })
        common.log_event("family", caseRef=ref, toRef=to_ref, status="send_failed",
                         sesCode=code, errorType=type(err).__name__)
        raise

    sends_used = int(item.get("familySends") or 0) + 1
    common.log_event("family", caseRef=ref, toRef=to_ref, status="sent",
                     sendsUsed=sends_used, stepCount=len(message["text"].splitlines()))
    return common.json_response(200, {
        "sent": True,
        "sendsUsed": sends_used,
        "sendsRemaining": max(MAX_SENDS - sends_used, 0),
    })
