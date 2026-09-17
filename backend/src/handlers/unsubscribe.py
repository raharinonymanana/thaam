"""/r/unsubscribe - stop a case's reminders, in two steps.

GET shows a page with one button and MUTATES NOTHING: mail clients and link
scanners prefetch links, and a mutating GET would unsubscribe people who never
clicked. Only the POST that button makes cancels anything.

A wrong token and an unknown case return a byte-identical page, so the endpoint
cannot be used to find out whether a case ID exists (the same reasoning as not
granting s3:ListBucket).
"""
from __future__ import annotations

import hmac
import os
from html import escape
from urllib.parse import parse_qs

from botocore.exceptions import ClientError

from handlers import common

SCHEDULE_GROUP = os.environ.get("SCHEDULE_GROUP", "")

_PAGE = (
    "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
    "<meta name=\"robots\" content=\"noindex\">"
    "<title>Thaam reminders</title></head><body>{body}</body></html>"
)

# Identical for a bad token and for a case that does not exist.
_GENERIC_ERROR = _PAGE.format(body=(
    "<h1>This link did not work</h1>"
    "<p>The link may be old or incomplete. You can also stop the reminders by "
    "replying to any Thaam reminder email.</p>"
))
_CONFIRMED = _PAGE.format(body=(
    "<h1>Reminders stopped</h1>"
    "<p>Thaam will not email you about this case again. Your case record still "
    "expires by itself.</p>"
))


def _form_page(case_id: str, token: str) -> str:
    action = f"/r/unsubscribe?c={escape(case_id, quote=True)}&amp;t={escape(token, quote=True)}"
    return _PAGE.format(body=(
        "<h1>Stop these reminders?</h1>"
        "<p>Thaam will stop emailing you about this case. Nothing else changes.</p>"
        f'<form method="post" action="{action}">'
        '<button type="submit">Stop these reminders</button>'
        "</form>"
    ))


def _params(event: dict) -> tuple[str, str]:
    """c and t, from the query string or, for the POST, a form body."""
    params = dict(event.get("queryStringParameters") or {})
    if not params.get("c") or not params.get("t"):
        body = common.parse_json_body(event)
        if isinstance(body, dict):
            params = {**params, **{k: v for k, v in body.items() if k in ("c", "t")}}
        elif event.get("body"):
            raw = event["body"]
            form = parse_qs(raw if isinstance(raw, str) else "")
            params = {**params, **{k: v[0] for k, v in form.items() if k in ("c", "t")}}
    return params.get("c") or "", params.get("t") or ""


def _authorised(case_id: str, token: str):
    """(item, reminders) when the token matches, else (None, None)."""
    if not common.is_valid_case_id(case_id) or not token:
        return None, None
    item = common.cases_table().get_item(Key={"caseId": case_id}).get("Item")
    reminders = (item or {}).get("reminders") or {}
    stored = reminders.get("unsubToken") or ""
    if not stored or not hmac.compare_digest(str(stored), str(token)):
        return None, None
    return item, reminders


def lambda_handler(event, context):
    method = (event.get("requestContext", {}).get("http", {}).get("method") or "GET").upper()
    case_id, token = _params(event)
    item, reminders = _authorised(case_id, token)
    if item is None:
        # Deliberately says nothing about which half of the link was wrong.
        common.log_event("unsubscribe", status="rejected", method=method)
        return common.html_response(400, _GENERIC_ERROR)

    ref = common.case_ref(case_id)
    if method == "GET":
        common.log_event("unsubscribe", caseRef=ref, status="form_shown")
        return common.html_response(200, _form_page(case_id, token))

    names = [s.get("scheduleName") for s in reminders.get("steps", []) if s.get("scheduleName")]
    deleted = 0
    for name in names:
        try:
            common.scheduler().delete_schedule(Name=name, GroupName=SCHEDULE_GROUP)
            deleted += 1
        except ClientError as err:
            # A schedule that already fired deleted itself: that is success.
            if err.response.get("Error", {}).get("Code") != "ResourceNotFoundException":
                raise

    common.cases_table().update_item(
        Key={"caseId": case_id},
        UpdateExpression="SET #reminders.#status = :cancelled",
        ExpressionAttributeNames={"#reminders": "reminders", "#status": "status"},
        ExpressionAttributeValues={":cancelled": "cancelled"},
    )
    common.log_event("unsubscribe", caseRef=ref, status="cancelled",
                     deletedCount=deleted, scheduleCount=len(names))
    return common.html_response(200, _CONFIRMED)
