"""GET /cases/{caseId} - the read-only case view (D110-D112)."""
import json
import logging
import re
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from handlers import common, family, get_case  # noqa: E402
from plan_builder import build_plan  # noqa: E402
from working_days import IST  # noqa: E402

CASE_ID = "abcdefghijklmnopqrstuv"
TOKEN = "deadbeefcafef00ddeadbeefcafef00d"
EMAIL = "victim@example.com"
SENT_AT = "2026-09-18T04:30:11+00:00"  # what reminder.py writes onto a step it sent

FIELDS = {
    "amount": "49999.00",
    "utr": "426173859012",
    "txn_date": "2026-09-17",
    "txn_time": "10:41:07",
    "account_masked": "XX1234",
    "payee_vpa": "refund.help99@okaxis",
    "payee_phone": "9876543210",
    "bank": "Sample Bank",
}
# The moment the plan was built, exactly as plan.py stores it.
PLANNED_AT = datetime(2026, 9, 17, 11, 1, 7, tzinfo=IST)
PLANNED_AT_ISO = PLANNED_AT.isoformat(timespec="seconds")
FAR_FUTURE = int((datetime.now(timezone.utc) + timedelta(days=60)).timestamp())

# Every deadline the original POST /plan answered with, on each path.
ORIGINAL = {
    shared: build_plan(dict(FIELDS), shared, reported_at=PLANNED_AT, now=PLANNED_AT)
    for shared in ("no", "yes", "not_sure")
}


def _item(shared="no", **overrides):
    item = {
        "caseId": CASE_ID,
        "status": "planned",
        "confirmedFields": dict(FIELDS),
        "sharedCredentials": shared,
        "path": "authorised" if shared == "yes" else "unauthorised",
        "clocks": ORIGINAL[shared]["clocks"],
        "plannedAt": PLANNED_AT_ISO,
        "expiresAt": FAR_FUTURE,
    }
    item.update(overrides)
    return item


def _reminders_attr(**overrides):
    reminders = {
        "status": "active",
        "email": EMAIL,
        "unsubToken": TOKEN,
        "demo": False,
        "enrolledAt": PLANNED_AT_ISO,
        "steps": [
            {"step": "bank_ack", "realDueDate": "2026-09-19", "urgent": False,
             "status": "scheduled", "fireAt": "2026-09-18T10:00:00+05:30",
             "scheduleName": "thaam-f69f9b70d1c9-bank_ack"},
            {"step": "liability_window", "realDueDate": "2026-09-24", "urgent": False,
             "status": "skipped", "reason": "deadline_passed", "fireAt": None},
        ],
    }
    reminders.update(overrides)
    return reminders


def _sent_reminders_attr():
    """The same cadence after the reminder handler emailed the first step."""
    reminders = _reminders_attr()
    reminders["steps"][0]["sentAt"] = SENT_AT
    return reminders


@pytest.fixture
def table(monkeypatch):
    mock = MagicMock()
    mock.get_item.return_value = {"Item": _item()}
    monkeypatch.setattr(common, "_clients", {"table": mock})
    return mock


def _call(case_id=CASE_ID):
    resp = get_case.lambda_handler({"pathParameters": {"caseId": case_id}}, None)
    return resp, json.loads(resp["body"])


def _walk(value):
    """Every key and every scalar in the response, flattened."""
    if isinstance(value, dict):
        for key, inner in value.items():
            yield key
            yield from _walk(inner)
    elif isinstance(value, list):
        for inner in value:
            yield from _walk(inner)
    else:
        yield value


# ---------------- the deadlines are the plan's, not today's ----------------

DATED_CLOCKS = [("bankReport", "deadline"), ("limitedLiability", "until"),
                ("shadowCredit", "by"), ("resolution", "by"),
                ("ombudsman", "eligibleFrom")]


def test_unauthorised_case_returns_the_original_deadlines(table):
    resp, body = _call()
    assert resp["statusCode"] == 200
    assert body["path"] == "unauthorised"
    assert body["notSure"] is False
    for clock, key in DATED_CLOCKS:
        assert body["clocks"][clock][key] == ORIGINAL["no"]["clocks"][clock][key], clock
    assert body["steps"] == ORIGINAL["no"]["steps"]
    assert body["script"] == ORIGINAL["no"]["script"]
    assert body["disclaimers"] == ORIGINAL["no"]["disclaimers"]


def test_not_sure_is_the_unauthorised_path_and_keeps_the_flag(table):
    table.get_item.return_value = {"Item": _item(shared="not_sure")}
    resp, body = _call()
    assert resp["statusCode"] == 200
    assert body["path"] == "unauthorised"
    assert body["notSure"] is True
    for clock, key in DATED_CLOCKS:
        assert body["clocks"][clock][key] == ORIGINAL["not_sure"]["clocks"][clock][key]


def test_authorised_case_has_no_bank_liability_clocks(table):
    table.get_item.return_value = {"Item": _item(shared="yes")}
    resp, body = _call()
    assert resp["statusCode"] == 200
    assert body["path"] == "authorised"
    assert "bankReport" not in body["clocks"]
    assert "limitedLiability" not in body["clocks"]
    assert set(body["clocks"]) == set(ORIGINAL["yes"]["clocks"])
    assert (body["clocks"]["ombudsman"]["eligibleFrom"]
            == ORIGINAL["yes"]["clocks"]["ombudsman"]["eligibleFrom"])
    assert body["steps"] == ORIGINAL["yes"]["steps"]


def test_golden_hour_moves_with_now_but_stays_expired(table):
    _, body = _call()
    golden = body["clocks"]["goldenHour"]
    # Only the live part of the clock moves; the deadline itself does not.
    assert golden["deadline"] == ORIGINAL["no"]["clocks"]["goldenHour"]["deadline"]
    assert golden["expired"] is True
    assert golden["minutesLeft"] < 0
    assert golden["message"]


def test_response_keys(table):
    _, body = _call()
    assert set(body) == {"caseId", "path", "notSure", "clocks", "steps", "script",
                         "disclaimers", "fields", "plannedAt", "reminders", "family"}
    assert body["caseId"] == CASE_ID
    assert body["plannedAt"] == PLANNED_AT_ISO


def test_fields_are_the_eight_confirmed_keys_only(table):
    table.get_item.return_value = {"Item": _item(
        confirmedFields=dict(FIELDS, direction="debit", missing=["utr"]))}
    _, body = _call()
    assert body["fields"] == FIELDS


def test_the_handler_never_writes(table):
    _call()
    table.update_item.assert_not_called()
    table.put_item.assert_not_called()
    table.delete_item.assert_not_called()


# ---------------- nothing secret leaks ----------------

# Attributes of the stored reminders that must never be echoed.
PRIVATE_REMINDER_KEYS = ("email", "unsubToken", "scheduleName", "realDueDate",
                         "enrolledAt")


def test_response_carries_no_email_and_no_unsub_token(table):
    table.get_item.return_value = {"Item": _item(reminders=_sent_reminders_attr())}
    resp, body = _call()
    assert resp["statusCode"] == 200
    values = list(_walk(body))
    assert "email" not in values
    assert "unsubToken" not in values
    assert EMAIL not in values
    assert TOKEN not in values
    raw = resp["body"]
    assert EMAIL not in raw
    assert TOKEN not in raw
    assert "victim" not in raw
    for key in PRIVATE_REMINDER_KEYS:
        assert key not in values, key
        assert key not in raw, key
    # The step that was sent is still reported, so the walk above really ran
    # over a fully-populated cadence.
    assert SENT_AT in raw


SAFE_STEP_KEYS = {"step", "fireAt", "status", "sentAt", "reason"}


def test_reminder_steps_expose_only_the_five_safe_keys(table):
    table.get_item.return_value = {"Item": _item(reminders=_reminders_attr())}
    _, body = _call()
    assert body["reminders"]["status"] == "active"
    assert body["reminders"]["demo"] is False
    assert body["reminders"]["steps"] == [
        {"step": "bank_ack", "fireAt": "2026-09-18T10:00:00+05:30",
         "status": "scheduled", "sentAt": None, "reason": None},
        {"step": "liability_window", "fireAt": None, "status": "skipped",
         "sentAt": None, "reason": "deadline_passed"},
    ]


def test_sent_at_is_reported_when_the_reminder_went_out(table):
    table.get_item.return_value = {"Item": _item(reminders=_sent_reminders_attr())}
    _, body = _call()
    steps = body["reminders"]["steps"]
    assert steps[0]["sentAt"] == SENT_AT
    assert steps[0]["status"] == "scheduled"
    # A step the handler has not reached yet reports null, not a missing key.
    assert steps[1]["sentAt"] is None
    assert all(set(s) == SAFE_STEP_KEYS for s in steps)


def test_sent_at_is_null_when_nothing_has_been_sent(table):
    table.get_item.return_value = {"Item": _item(reminders=_reminders_attr())}
    _, body = _call()
    assert [s["sentAt"] for s in body["reminders"]["steps"]] == [None, None]
    assert all("sentAt" in s for s in body["reminders"]["steps"])


@pytest.mark.parametrize("reason", ["deadline_passed", "case_expiring"])
def test_a_skipped_step_says_why(table, reason):
    # Without this a returning victim sees a bare "Skipped" and cannot tell a
    # passed deadline from a case that closes before the date.
    reminders = _reminders_attr()
    reminders["steps"][1]["reason"] = reason
    table.get_item.return_value = {"Item": _item(reminders=reminders)}
    _, body = _call()
    assert body["reminders"]["steps"][1]["reason"] == reason


@pytest.mark.parametrize("reason", [
    "something_new", "", None, 42, "deadline_passed ", "DEADLINE_PASSED",
])
def test_an_unknown_reason_is_dropped_not_passed_through(table, reason):
    # These two strings are wording written for a victim to read. A reason
    # added to the backend later must not reach the screen raw.
    reminders = _reminders_attr()
    reminders["steps"][1]["reason"] = reason
    table.get_item.return_value = {"Item": _item(reminders=reminders)}
    resp, body = _call()
    assert body["reminders"]["steps"][1]["reason"] is None
    if isinstance(reason, str) and reason.strip():
        assert reason not in resp["body"]


def test_a_scheduled_step_has_no_reason(table):
    table.get_item.return_value = {"Item": _item(reminders=_reminders_attr())}
    _, body = _call()
    assert body["reminders"]["steps"][0]["status"] == "scheduled"
    assert body["reminders"]["steps"][0]["reason"] is None


def test_reminders_null_when_never_enrolled(table):
    _, body = _call()
    assert body["reminders"] is None


@pytest.mark.parametrize("status", ["active", "cancelled"])
def test_reminders_report_their_status(table, status):
    table.get_item.return_value = {"Item": _item(reminders=_reminders_attr(status=status))}
    _, body = _call()
    assert body["reminders"]["status"] == status


def test_reminders_report_demo_mode(table):
    table.get_item.return_value = {"Item": _item(reminders=_reminders_attr(demo=True))}
    _, body = _call()
    assert body["reminders"]["demo"] is True


# ---------------- family send budget ----------------

@pytest.mark.parametrize("used, remaining", [
    (None, family.MAX_SENDS), (0, family.MAX_SENDS),
    (1, family.MAX_SENDS - 1), (family.MAX_SENDS, 0), (family.MAX_SENDS + 1, 0),
])
def test_family_sends_remaining(table, used, remaining):
    item = _item() if used is None else _item(familySends=Decimal(used))
    table.get_item.return_value = {"Item": item}
    _, body = _call()
    assert body["family"] == {"sendsRemaining": remaining}


def test_dynamodb_decimals_serialise_as_json_numbers(table):
    # DynamoDB returns every number as a Decimal, which json cannot encode.
    table.get_item.return_value = {"Item": _item(familySends=Decimal(1),
                                                 expiresAt=Decimal(FAR_FUTURE))}
    resp, body = _call()
    assert resp["statusCode"] == 200
    remaining = body["family"]["sendsRemaining"]
    assert remaining == family.MAX_SENDS - 1
    assert isinstance(remaining, int)
    assert f'"sendsRemaining": {family.MAX_SENDS - 1}' in resp["body"]


# ---------------- caching and errors ----------------

def test_cache_control_is_no_store(table):
    resp, _ = _call()
    assert resp["headers"]["Cache-Control"] == "no-store"
    assert resp["headers"]["Content-Type"] == "application/json"


@pytest.mark.parametrize("case_id", ["bad id", "short", "", None, "a" * 23])
def test_invalid_case_id_is_rejected_and_never_logged(table, caplog, case_id):
    caplog.set_level(logging.INFO)
    resp = get_case.lambda_handler({"pathParameters": {"caseId": case_id}}, None)
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "invalid_case_id"
    assert resp["headers"]["Cache-Control"] == "no-store"
    assert caplog.records == []
    table.get_item.assert_not_called()


def test_missing_case_is_404(table):
    table.get_item.return_value = {}
    resp, body = _call()
    assert resp["statusCode"] == 404
    assert body["error"] == "not_found"


def test_expired_case_looks_deleted(table, caplog):
    caplog.set_level(logging.INFO)
    past = int((datetime.now(timezone.utc) - timedelta(minutes=1)).timestamp())
    table.get_item.return_value = {"Item": _item(expiresAt=Decimal(past))}
    resp, body = _call()
    # The TTL deletes lazily, so an expired item is still readable for hours.
    # It has to answer exactly like a missing one, with none of the case in it.
    assert resp["statusCode"] == 404
    assert body == {"error": "not_found", "message": "Case not found."}
    assert "Sample Bank" not in resp["body"]
    assert json.loads(caplog.records[0].getMessage())["status"] == "expired"


def test_case_expiring_in_a_minute_is_still_readable(table):
    soon = int((datetime.now(timezone.utc) + timedelta(minutes=1)).timestamp())
    table.get_item.return_value = {"Item": _item(expiresAt=Decimal(soon))}
    assert _call()[0]["statusCode"] == 200


@pytest.mark.parametrize("overrides", [
    {"status": "awaiting_upload"},
    {"status": "extracted"},
    {"status": None},
    {"confirmedFields": None},
    {"plannedAt": None},
    {"sharedCredentials": "maybe"},
])
def test_unplanned_case_is_409(table, overrides):
    table.get_item.return_value = {"Item": _item(**overrides)}
    resp, body = _call()
    assert resp["statusCode"] == 409
    assert body["error"] == "no_plan"
    assert body["message"] == "Build the plan before opening the case."


# ---------------- logging ----------------

def test_log_carries_the_ref_only(table, caplog):
    caplog.set_level(logging.INFO)
    table.get_item.return_value = {"Item": _item(reminders=_reminders_attr())}
    _call()
    assert CASE_ID not in caplog.text
    assert common.case_ref(CASE_ID) in caplog.text
    for value in ("49999", "426173859012", "refund.help99@okaxis", "XX1234",
                  "Sample Bank", "9876543210", EMAIL, TOKEN):
        assert value not in caplog.text, value
    assert json.loads(caplog.records[0].getMessage()) == {
        "event": "get_case", "caseRef": common.case_ref(CASE_ID),
        "status": "ok", "path": "unauthorised", "enrolled": True,
    }


# ---------------- template (least privilege) ----------------

TEMPLATE = (Path(__file__).resolve().parents[2] / "template.yaml").read_text(encoding="utf-8")


def _resource_block(name: str) -> str:
    lines = TEMPLATE.splitlines()
    start = next(i for i, line in enumerate(lines) if line == f"  {name}:")
    end = next((i for i in range(start + 1, len(lines))
                if lines[i].strip() and not lines[i].startswith("    ")), len(lines))
    return "\n".join(lines[start:end])


def test_get_case_function_can_only_read_one_item():
    block = _resource_block("GetCaseFunction")
    assert "Handler: handlers.get_case.lambda_handler" in block
    assert "Timeout: 5" in block
    assert re.findall(r"^\s+-? ?Action:\s*(\S+)$", block, re.MULTILINE) == ["dynamodb:GetItem"]
    # One resource, and it is the cases table.
    assert re.findall(r"Resource:\s*(.+)$", block, re.MULTILINE) == ["!GetAtt CasesTable.Arn"]
    for forbidden in ("UpdateItem", "PutItem", "DeleteItem", "Query", "Scan",
                      "s3:", "ses:", "scheduler:", "polly:", "textract:", "iam:"):
        assert forbidden not in block, forbidden


def test_get_case_route_is_its_own_function():
    # Two functions answer on this path - GET to read it, DELETE to erase it -
    # and each carries only the permissions its own verb needs.
    assert TEMPLATE.count("Path: /cases/{caseId}\n") == 2
    assert "Path: /cases/{caseId}\n" in _resource_block("GetCaseFunction")
    assert "Path: /cases/{caseId}\n" in _resource_block("DeleteCaseFunction")
    # Neither is bolted onto a function that can write the case.
    assert "Method: GET" not in _resource_block("PlanFunction")
    assert "Method: DELETE" not in _resource_block("PlanFunction")
    assert "Method: DELETE" not in _resource_block("GetCaseFunction")


def test_get_case_has_a_retained_log_group():
    block = _resource_block("GetCaseLogGroup")
    assert "/aws/lambda/${GetCaseFunction}" in block
    assert "RetentionInDays: 14" in block
