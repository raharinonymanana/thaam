import json
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import reminder_email  # noqa: E402
import reminder_steps  # noqa: E402
from handlers import common, enroll, reminder, unsubscribe  # noqa: E402
from working_days import IST  # noqa: E402

CASE_ID = "abcdefghijklmnopqrstuv"
REF = "f69f9b70d1c9"  # common.case_ref(CASE_ID), asserted below
TOKEN = "deadbeefcafef00ddeadbeefcafef00d"  # no digit run that a redaction check would hit

# A case planned on Thu 17 Sep 2026, unauthorised path, with the clocks the
# plan handler really produces (see test_plan.py).
CLOCKS = {
    "goldenHour": {"deadline": "2026-09-17T11:41:07+05:30", "expired": True, "estimated": True},
    "bankReport": {"deadline": "2026-09-19T23:59:59+05:30", "estimated": True},
    "limitedLiability": {"until": "2026-09-24T23:59:59+05:30", "estimated": True},
    "shadowCredit": {"by": "2026-09-29T23:59:59+05:30", "estimated": True},
    "resolution": {"by": "2026-12-16T11:01:07+05:30", "estimated": True},
    "ombudsman": {"eligibleFrom": "2026-10-17T11:01:07+05:30", "estimated": True},
}
AUTHORISED_CLOCKS = {
    "goldenHour": CLOCKS["goldenHour"],
    "resolution": CLOCKS["resolution"],
    "ombudsman": CLOCKS["ombudsman"],
}
# Fully-populated case fields, to prove none of them reach an email.
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
NOW = datetime(2026, 9, 17, 11, 1, 7, tzinfo=IST)
EXPIRES_AT = int(datetime(2026, 12, 16, 11, 1, 7, tzinfo=IST).timestamp())


def _steps(clocks=CLOCKS, now=NOW, expires_at=EXPIRES_AT, **kw):
    return reminder_steps.build_steps(clocks, now, expires_at=expires_at, **kw)


def _by_step(steps):
    return {s["step"]: s for s in steps}


def _fire(step):
    return datetime.fromisoformat(step["fireAt"])


# ---------------- cadence ----------------

def test_case_ref_constant_matches_helper():
    assert common.case_ref(CASE_ID) == REF


def test_unauthorised_path_has_five_anchored_steps():
    steps = _steps()
    assert [s["step"] for s in steps] == [
        "bank_ack", "liability_window", "shadow_credit", "ombudsman", "closeout"]
    assert all(s["status"] == "scheduled" for s in steps)
    assert "portal_status" not in _by_step(steps)
    assert "week_check" not in _by_step(steps)


def test_authorised_path_has_four_steps_and_no_liability_step():
    steps = _steps(AUTHORISED_CLOCKS)
    assert [s["step"] for s in steps] == [
        "bank_ack", "portal_status", "ombudsman", "closeout"]
    # No liability cap exists for an authorised transfer.
    assert "liability_window" not in _by_step(steps)
    assert "shadow_credit" not in _by_step(steps)


def test_authorised_offsets_are_t_plus_one_and_three():
    steps = _by_step(_steps(AUTHORISED_CLOCKS))
    assert _fire(steps["bank_ack"]).date() == (NOW + timedelta(days=1)).date()
    assert _fire(steps["portal_status"]).date() == (NOW + timedelta(days=3)).date()


def test_cliff_before_a_monday_deadline_never_fires_on_a_sunday():
    # Deadline Mon 21 Sep 2026: -24h would be Sunday, when no bank is open.
    # Sat 19 Sep is the 3rd Saturday, so Indian banks ARE open: that is the
    # working day immediately before, and the reminder fires then.
    clocks = {**CLOCKS, "bankReport": {"deadline": "2026-09-21T23:59:59+05:30"}}
    fire = _fire(_by_step(_steps(clocks))["bank_ack"])
    assert fire.date().isoformat() == "2026-09-19"  # Saturday, a working one
    assert fire.strftime("%H:%M") == "10:00"


def test_cliff_before_a_monday_falls_back_to_friday_over_a_closed_saturday():
    # Deadline Mon 14 Sep 2026: Sat 12 is the 2nd Saturday (banks closed),
    # Sun 13 is closed, so the reminder fires Friday 11.
    clocks = {**CLOCKS, "bankReport": {"deadline": "2026-09-14T23:59:59+05:30"}}
    fire = _fire(_by_step(_steps(clocks, now=datetime(2026, 9, 10, 9, 0, tzinfo=IST)))["bank_ack"])
    assert fire.date().isoformat() == "2026-09-11"  # Friday
    assert fire.strftime("%H:%M") == "10:00"


def test_cliff_before_a_wednesday_deadline_fires_the_tuesday():
    clocks = {**CLOCKS, "bankReport": {"deadline": "2026-09-23T23:59:59+05:30"}}
    fire = _fire(_by_step(_steps(clocks))["bank_ack"])
    assert fire.date().isoformat() == "2026-09-22"  # Tuesday
    assert fire.strftime("%H:%M") == "10:00"


def test_cliff_skips_a_second_and_fourth_saturday():
    # Deadline Sun 27 Sep 2026; Sat 26 is the 4th Saturday, so Friday 25.
    clocks = {**CLOCKS, "bankReport": {"deadline": "2026-09-27T23:59:59+05:30"}}
    assert _fire(_by_step(_steps(clocks))["bank_ack"]).date().isoformat() == "2026-09-25"


def test_ombudsman_fires_on_eligible_date_never_before():
    step = _by_step(_steps())["ombudsman"]
    opens = datetime.fromisoformat(CLOCKS["ombudsman"]["eligibleFrom"])
    assert _fire(step) >= opens
    assert _fire(step).date() == opens.date()


def test_closeout_is_before_the_case_ttl():
    step = _by_step(_steps())["closeout"]
    limit = datetime.fromtimestamp(EXPIRES_AT, IST) - timedelta(hours=48)
    assert _fire(step) <= limit
    # Five days before resolution.by, normalised to 10:00 IST (D101): the raw
    # clock carries the time of day the plan was built (02:10 IST here).
    assert _fire(step).date() == (
        datetime.fromisoformat(CLOCKS["resolution"]["by"]) - timedelta(days=5)).date()
    assert _fire(step).strftime("%H:%M:%S") == "10:00:00"


def test_closeout_normalises_an_awkward_resolution_time():
    clocks = {**CLOCKS, "resolution": {"by": "2026-12-16T02:10:00+05:30"}}
    step = _by_step(_steps(clocks))["closeout"]
    assert step["fireAt"] == "2026-12-11T10:00:00+05:30"


def test_all_anchored_steps_fire_at_ten_in_the_morning():
    for step in reminder_steps.scheduled(_steps()):
        fire = _fire(step)
        if step["step"] == "ombudsman":  # gate: never before the right opens
            assert fire.strftime("%H:%M:%S") == "11:01:07"
        else:
            assert fire.strftime("%H:%M:%S") == "10:00:00"


def test_closeout_is_clamped_when_resolution_is_late():
    clocks = {**CLOCKS, "resolution": {"by": "2027-03-01T11:00:00+05:30"}}
    step = _by_step(_steps(clocks))["closeout"]
    limit = datetime.fromtimestamp(EXPIRES_AT, IST) - timedelta(hours=48)
    assert _fire(step) <= limit


def test_passed_deadline_is_skipped_and_later_steps_survive():
    # Enrolled on 22 Sep: the 19 Sep bank report deadline is gone.
    late = datetime(2026, 9, 22, 9, 0, tzinfo=IST)
    steps = _by_step(_steps(now=late))
    assert steps["bank_ack"]["status"] == "skipped"
    assert steps["bank_ack"]["reason"] == "deadline_passed"
    assert steps["bank_ack"]["fireAt"] is None
    assert steps["liability_window"]["status"] == "scheduled"
    assert steps["shadow_credit"]["status"] == "scheduled"


def test_deadline_ten_minutes_away_fires_in_fifteen_minutes_as_urgent():
    now = datetime(2026, 9, 19, 23, 49, 59, tzinfo=IST)  # 10 min before the cliff
    step = _by_step(_steps(now=now))["bank_ack"]
    assert step["status"] == "scheduled"
    assert step["urgent"] is True
    assert _fire(step) == now + timedelta(minutes=15)


def test_no_fire_time_is_ever_in_the_past():
    for now in (NOW, datetime(2026, 9, 19, 23, 49, tzinfo=IST),
                datetime(2026, 10, 17, 10, 30, tzinfo=IST),
                datetime(2026, 12, 13, 9, 0, tzinfo=IST)):
        for step in reminder_steps.scheduled(_steps(now=now)):
            assert _fire(step) > now


def test_demo_mode_compresses_firing_but_keeps_real_dates():
    steps = reminder_steps.scheduled(_steps(demo=True, demo_step_seconds=60))
    assert [(_fire(s) - NOW).total_seconds() for s in steps] == [60, 120, 180, 240, 300]
    assert _by_step(steps)["bank_ack"]["realDueDate"] == "2026-09-19"
    assert _by_step(steps)["closeout"]["realDueDate"] == "2026-12-16"


def test_at_expression_is_utc_without_offset():
    assert reminder_steps.at_expression("2026-09-18T10:00:00+05:30") == "at(2026-09-18T04:30:00)"


def test_case_link_keeps_the_case_id_in_the_fragment(monkeypatch):
    # D111: a fragment never reaches a server, so the case ID stays out of the
    # Amplify access log and out of the Referer header the page would send.
    monkeypatch.setattr(reminder, "PUBLIC_BASE_URL", "https://site.example.com")
    url = reminder.case_url(CASE_ID)
    assert url == f"https://site.example.com/#case={CASE_ID}"
    assert url.split("#")[0] == "https://site.example.com/"
    assert CASE_ID not in url.split("#")[0]


def test_schedule_name_uses_the_fingerprint_not_the_case_id():
    name = reminder_steps.schedule_name(REF, "bank_ack")
    assert name == f"thaam-{REF}-bank_ack"
    assert CASE_ID not in name


# ---------------- email body (D88) ----------------

SENSITIVE = ["49999", "49,999", "426173859012", "4261 7385 9012", "refund.help99@okaxis",
             "9876543210", "98765 43210", "XX1234", "1234", "Sample Bank", "okaxis"]


@pytest.mark.parametrize("step", ["bank_ack", "liability_window", "shadow_credit",
                                  "ombudsman", "closeout", "portal_status"])
def test_email_contains_no_sensitive_field(step):
    message = reminder_email.render(
        step=step, real_due_date="2026-09-19",
        case_url=f"https://main.dhg3lzpzbimpz.amplifyapp.com/#case={CASE_ID}",
        unsubscribe_url=f"https://api.example.com/r/unsubscribe?c={CASE_ID}&t={TOKEN}",
    )
    for lang in ("text", "html"):
        for value in SENSITIVE:
            assert value not in message[lang], (step, lang, value)
        assert CASE_ID in message[lang]  # the case link is allowed
        assert "unsubscribe" in message[lang]
    assert "<img" not in message["html"]
    assert "http://" not in message["html"]
    assert "cid:" not in message["html"]


def test_email_names_the_consequence_and_date():
    message = reminder_email.render("bank_ack", "2026-09-19", "u", "v")
    assert "19 September 2026" in message["text"]
    assert "zero liability" in message["text"]
    urgent = reminder_email.render("bank_ack", "2026-09-19", "u", "v", urgent=True)
    assert urgent["text"].startswith("Less than a day left.")


def test_authorised_bank_ack_copy_differs():
    text = reminder_email.render("bank_ack", "2026-09-19", "u", "v", path="authorised")["text"]
    assert "zero liability" not in text
    assert "1930 complaint" in text


# ---------------- enroll handler ----------------

@pytest.fixture
def aws(monkeypatch):
    mocks = {"table": MagicMock(), "scheduler": MagicMock(), "sesv2": MagicMock()}
    mocks["table"].get_item.return_value = {"Item": {
        "caseId": CASE_ID, "status": "planned", "path": "unauthorised",
        "confirmedFields": FIELDS, "clocks": CLOCKS, "expiresAt": EXPIRES_AT,
    }}
    monkeypatch.setattr(common, "_clients", mocks)
    monkeypatch.setattr(enroll, "SCHEDULE_GROUP", "thaam-reminders")
    monkeypatch.setattr(enroll, "REMINDER_FUNCTION_ARN",
                        "arn:aws:lambda:us-east-1:111122223333:function:thaam-reminder")
    monkeypatch.setattr(enroll, "SCHEDULER_ROLE_ARN",
                        "arn:aws:iam::111122223333:role/thaam-SchedulerInvokeRole")
    monkeypatch.setattr(enroll, "ALLOW_DEMO_MODE", "false")
    monkeypatch.setattr(unsubscribe, "SCHEDULE_GROUP", "thaam-reminders")
    # CLOCKS, EXPIRES_AT and every fire time asserted below were written for a
    # case planned at NOW. Reading the wall clock instead would make the whole
    # cadence drift: once a deadline passes, its step is skipped and the next
    # one turns urgent, so these tests would start failing on their own (D113).
    monkeypatch.setattr(enroll, "_now", lambda: NOW.astimezone(timezone.utc))
    return mocks


def _client_error(code, operation="Op"):
    return ClientError({"Error": {"Code": code, "Message": "x"}}, operation)


def _enroll(body=None, case_id=CASE_ID):
    body = {"email": "victim@example.com", "demo": False} if body is None else body
    event = {"pathParameters": {"caseId": case_id}, "body": json.dumps(body)}
    resp = enroll.lambda_handler(event, None)
    return resp, json.loads(resp["body"])


def _created(aws):
    return [c.kwargs for c in aws["scheduler"].create_schedule.call_args_list]


def test_enroll_happy_path_creates_five_schedules(aws):
    resp, body = _enroll()
    assert resp["statusCode"] == 201
    assert body["enrolled"] is True
    assert [s["step"] for s in body["steps"]] == [
        "bank_ack", "liability_window", "shadow_credit", "ombudsman", "closeout"]
    assert all(set(s) == {"step", "fireAt", "urgent"} for s in body["steps"])
    assert all(s["urgent"] is False for s in body["steps"])

    created = _created(aws)
    assert len(created) == 5
    assert [c["Name"] for c in created] == [
        f"thaam-{REF}-{s}" for s in
        ("bank_ack", "liability_window", "shadow_credit", "ombudsman", "closeout")]
    for call in created:
        assert call["GroupName"] == "thaam-reminders"
        assert call["ScheduleExpressionTimezone"] == "UTC"
        assert call["FlexibleTimeWindow"] == {"Mode": "OFF"}
        assert call["ActionAfterCompletion"] == "DELETE"
        assert call["ScheduleExpression"].startswith("at(20")
        assert "Z" not in call["ScheduleExpression"]
        assert "+" not in call["ScheduleExpression"]
        assert call["Target"]["Arn"].endswith("function:thaam-reminder")
        assert call["Target"]["RoleArn"].startswith("arn:aws:iam::")
        assert call["Target"]["RetryPolicy"] == {"MaximumRetryAttempts": 3}
        assert json.loads(call["Target"]["Input"])["caseId"] == CASE_ID
        assert CASE_ID not in call["Name"]


def test_enroll_at_expressions_are_utc(aws):
    _enroll()
    expressions = [c["ScheduleExpression"] for c in _created(aws)]
    assert "at(2026-09-18T04:30:00)" in expressions  # 18 Sep 10:00 IST
    assert all(e.startswith("at(") and e.endswith(")") for e in expressions)


def test_enroll_stores_reminders_without_echoing_the_token(aws):
    resp, body = _enroll()
    stored = aws["table"].update_item.call_args.kwargs["ExpressionAttributeValues"][":reminders"]
    assert stored["status"] == "active"
    assert stored["email"] == "victim@example.com"
    assert stored["demo"] is False
    assert len(stored["unsubToken"]) == 32
    assert [s["scheduleName"] for s in stored["steps"]] == [f"thaam-{REF}-{s}" for s in (
        "bank_ack", "liability_window", "shadow_credit", "ombudsman", "closeout")]
    assert all(s["realDueDate"] for s in stored["steps"])
    assert stored["unsubToken"] not in json.dumps(body)


@pytest.mark.parametrize("email", [None, "", "not-an-email", "a@b", "a b@c.com", 42, "x" * 250 + "@e.com"])
def test_enroll_rejects_bad_email(aws, email):
    resp, body = _enroll({"email": email})
    assert resp["statusCode"] == 400
    assert body["field"] == "email"
    aws["scheduler"].create_schedule.assert_not_called()


def test_enroll_unknown_case_is_404(aws):
    aws["table"].get_item.return_value = {}
    assert _enroll()[0]["statusCode"] == 404


@pytest.mark.parametrize("item", [
    {"caseId": CASE_ID, "status": "extracted"},
    {"caseId": CASE_ID, "status": "planned"},  # no clocks
])
def test_enroll_without_a_plan_is_409(aws, item):
    aws["table"].get_item.return_value = {"Item": item}
    resp, body = _enroll()
    assert resp["statusCode"] == 409
    aws["scheduler"].create_schedule.assert_not_called()


def test_demo_is_forbidden_when_disabled(aws):
    resp, body = _enroll({"email": "victim@example.com", "demo": True})
    assert resp["statusCode"] == 403
    assert body["error"] == "demo_disabled"
    aws["scheduler"].create_schedule.assert_not_called()
    aws["table"].update_item.assert_not_called()


def test_demo_mode_fires_every_minute_when_enabled(aws, monkeypatch):
    monkeypatch.setattr(enroll, "ALLOW_DEMO_MODE", "true")
    resp, body = _enroll({"email": "victim@example.com", "demo": True})
    assert resp["statusCode"] == 201

    fire_times = [datetime.fromisoformat(s["fireAt"]) for s in body["steps"]]
    # The clock is frozen at NOW, so the offsets are exact, not approximate.
    offsets = [(t - NOW).total_seconds() for t in fire_times]
    assert offsets == [60.0, 120.0, 180.0, 240.0, 300.0]
    stored = aws["table"].update_item.call_args.kwargs["ExpressionAttributeValues"][":reminders"]
    assert stored["demo"] is True
    assert stored["steps"][0]["realDueDate"] == "2026-09-19"  # real date, not compressed


def test_re_enroll_deletes_then_recreates(aws):
    existing = [{"step": s, "scheduleName": f"thaam-{REF}-{s}"}
                for s in ("bank_ack", "liability_window", "shadow_credit", "ombudsman", "closeout")]
    aws["table"].get_item.return_value["Item"]["reminders"] = {
        "status": "active", "email": "old@example.com", "steps": existing,
        "unsubToken": TOKEN,
    }
    resp, body = _enroll()

    assert resp["statusCode"] == 201
    assert aws["scheduler"].delete_schedule.call_count == 5
    assert len(_created(aws)) == 5
    stored = aws["table"].update_item.call_args.kwargs["ExpressionAttributeValues"][":reminders"]
    assert len(stored["steps"]) == 5
    assert stored["unsubToken"] != TOKEN  # a fresh token each enrolment


def test_re_enroll_tolerates_already_fired_schedules(aws):
    aws["table"].get_item.return_value["Item"]["reminders"] = {
        "status": "active", "steps": [{"step": "bank_ack", "scheduleName": f"thaam-{REF}-bank_ack"}],
    }
    aws["scheduler"].delete_schedule.side_effect = _client_error(
        "ResourceNotFoundException", "DeleteSchedule")
    assert _enroll()[0]["statusCode"] == 201


def test_enroll_skips_passed_deadline_without_scheduling_it(aws, caplog):
    caplog.set_level(logging.INFO)
    aws["table"].get_item.return_value["Item"]["clocks"] = {
        **CLOCKS, "bankReport": {"deadline": "2020-01-01T23:59:59+05:30"}}
    resp, body = _enroll()

    assert resp["statusCode"] == 201
    assert [s["step"] for s in body["steps"]] == [
        "liability_window", "shadow_credit", "ombudsman", "closeout"]
    assert body["skipped"] == [{"step": "bank_ack", "reason": "deadline_passed"}]
    assert "bank_ack" not in [c["Name"].rsplit("-", 1)[1] for c in _created(aws)]
    events = [json.loads(r.getMessage()) for r in caplog.records]
    assert {"event": "reminder_step_skipped", "caseRef": REF,
            "step": "bank_ack", "reason": "deadline_passed"} in events


def test_enroll_logs_never_contain_the_case_id(aws, caplog):
    caplog.set_level(logging.INFO)
    _enroll()
    assert CASE_ID not in caplog.text
    assert REF in caplog.text
    assert "victim@example.com" not in caplog.text


def test_enroll_invalid_case_id_is_not_logged(aws, caplog):
    caplog.set_level(logging.INFO)
    resp, _ = _enroll(case_id="nope")
    assert resp["statusCode"] == 400
    assert caplog.records == []
    aws["table"].get_item.assert_not_called()


# ---------------- reminder handler ----------------

def _active_item(**overrides):
    item = {
        "caseId": CASE_ID, "status": "planned", "path": "unauthorised",
        "confirmedFields": FIELDS, "clocks": CLOCKS, "expiresAt": EXPIRES_AT,
        "reminders": {
            "status": "active", "email": "victim@example.com", "unsubToken": TOKEN,
            "demo": False,
            "steps": [{"step": "bank_ack", "realDueDate": "2026-09-19", "urgent": False,
                       "status": "scheduled", "fireAt": "2026-09-18T10:00:00+05:30",
                       "scheduleName": f"thaam-{REF}-bank_ack"}],
        },
    }
    item["reminders"].update(overrides)
    return item


@pytest.fixture
def sending(aws, monkeypatch):
    aws["table"].get_item.return_value = {"Item": _active_item()}
    monkeypatch.setattr(reminder, "SENDER_EMAIL", "reminders@example.com")
    monkeypatch.setattr(reminder, "PUBLIC_BASE_URL", "https://site.example.com")
    monkeypatch.setattr(reminder, "API_BASE_URL", "https://api.example.com")
    return aws


def _fire_reminder(step="bank_ack", case_id=CASE_ID):
    return reminder.lambda_handler({"caseId": case_id, "step": step}, None)


def test_reminder_sends_one_email(sending, caplog):
    caplog.set_level(logging.INFO)
    result = _fire_reminder()
    assert result == {"sent": True, "step": "bank_ack"}

    sent = sending["sesv2"].send_email.call_args.kwargs
    assert sent["FromEmailAddress"] == "Thaam <reminders@example.com>"
    assert sent["Destination"] == {"ToAddresses": ["victim@example.com"]}
    simple = sent["Content"]["Simple"]
    assert "19 September 2026" in simple["Body"]["Text"]["Data"]
    # The case ID rides in the fragment, so it never reaches an access log (D111).
    assert f"https://site.example.com/#case={CASE_ID}" in simple["Body"]["Text"]["Data"]
    assert (f"https://api.example.com/r/unsubscribe?c={CASE_ID}&t={TOKEN}"
            in simple["Body"]["Text"]["Data"])
    for part in ("Text", "Html"):
        for value in SENSITIVE:
            assert value not in simple["Body"][part]["Data"], value

    update = sending["table"].update_item.call_args.kwargs
    assert "sentAt" in update["ExpressionAttributeNames"].values()
    assert CASE_ID not in caplog.text
    assert TOKEN not in caplog.text
    assert "victim@example.com" not in caplog.text


@pytest.mark.parametrize("item, reason", [
    (None, "case_missing"),
    (_active_item(status="cancelled"), "not_active"),
    (_active_item(steps=[]), "unknown_step"),
])
def test_reminder_skips_without_sending(sending, caplog, item, reason):
    caplog.set_level(logging.INFO)
    sending["table"].get_item.return_value = {"Item": item} if item else {}
    result = _fire_reminder()

    assert result == {"sent": False, "reason": reason}
    sending["sesv2"].send_email.assert_not_called()
    sending["table"].update_item.assert_not_called()
    events = [json.loads(r.getMessage()) for r in caplog.records]
    assert events == [{"event": "reminder_skipped", "caseRef": REF,
                       "step": "bank_ack", "reason": reason}]
    assert CASE_ID not in caplog.text


def test_reminder_does_not_send_twice(sending):
    item = _active_item()
    item["reminders"]["steps"][0]["sentAt"] = "2026-09-18T04:30:00+00:00"
    sending["table"].get_item.return_value = {"Item": item}
    assert _fire_reminder()["reason"] == "already_sent"
    sending["sesv2"].send_email.assert_not_called()


def test_reminder_rejects_bad_input_without_hashing_it(sending, caplog):
    caplog.set_level(logging.INFO)
    assert _fire_reminder(case_id="../etc/passwd")["reason"] == "invalid_input"
    assert _fire_reminder(step="not_a_step")["reason"] == "invalid_input"
    sending["table"].get_item.assert_not_called()
    assert "caseRef" not in caplog.text


def test_urgent_reminder_leads_with_time_left(sending):
    item = _active_item()
    item["reminders"]["steps"][0]["urgent"] = True
    sending["table"].get_item.return_value = {"Item": item}
    _fire_reminder()
    text = sending["sesv2"].send_email.call_args.kwargs["Content"]["Simple"]["Body"]["Text"]["Data"]
    assert text.startswith("Less than a day left.")


# ---------------- unsubscribe handler ----------------

def _unsub_event(method, case_id=CASE_ID, token=TOKEN, in_body=False):
    event = {"requestContext": {"http": {"method": method}}}
    if in_body:
        event["body"] = f"c={case_id}&t={token}"
    else:
        event["queryStringParameters"] = {"c": case_id, "t": token}
    return event


@pytest.fixture
def enrolled(aws):
    item = _active_item(steps=[
        {"step": s, "scheduleName": f"thaam-{REF}-{s}", "realDueDate": "2026-09-19"}
        for s in ("bank_ack", "liability_window", "shadow_credit")])
    aws["table"].get_item.return_value = {"Item": item}
    return aws


def test_unsubscribe_get_mutates_nothing(enrolled, caplog):
    caplog.set_level(logging.INFO)
    resp = unsubscribe.lambda_handler(_unsub_event("GET"), None)

    assert resp["statusCode"] == 200
    assert resp["headers"]["Content-Type"] == "text/html; charset=utf-8"
    assert "Stop these reminders" in resp["body"]
    assert 'method="post"' in resp["body"]
    enrolled["table"].update_item.assert_not_called()
    enrolled["scheduler"].delete_schedule.assert_not_called()
    assert CASE_ID not in caplog.text


def test_unsubscribe_post_cancels_and_deletes_schedules(enrolled, caplog):
    caplog.set_level(logging.INFO)
    resp = unsubscribe.lambda_handler(_unsub_event("POST"), None)

    assert resp["statusCode"] == 200
    assert "Reminders stopped" in resp["body"]
    assert enrolled["scheduler"].delete_schedule.call_count == 3
    for call in enrolled["scheduler"].delete_schedule.call_args_list:
        assert call.kwargs["GroupName"] == "thaam-reminders"
        assert call.kwargs["Name"].startswith(f"thaam-{REF}-")
    values = enrolled["table"].update_item.call_args.kwargs["ExpressionAttributeValues"]
    assert values == {":cancelled": "cancelled"}
    assert CASE_ID not in caplog.text
    assert TOKEN not in caplog.text


def test_unsubscribe_post_accepts_a_form_body(enrolled):
    resp = unsubscribe.lambda_handler(_unsub_event("POST", in_body=True), None)
    assert resp["statusCode"] == 200
    assert "Reminders stopped" in resp["body"]


def test_unsubscribe_post_tolerates_already_fired_schedules(enrolled):
    enrolled["scheduler"].delete_schedule.side_effect = _client_error(
        "ResourceNotFoundException", "DeleteSchedule")
    resp = unsubscribe.lambda_handler(_unsub_event("POST"), None)
    assert resp["statusCode"] == 200
    enrolled["table"].update_item.assert_called_once()


def test_unsubscribe_other_scheduler_errors_raise(enrolled):
    enrolled["scheduler"].delete_schedule.side_effect = _client_error(
        "AccessDeniedException", "DeleteSchedule")
    with pytest.raises(ClientError):
        unsubscribe.lambda_handler(_unsub_event("POST"), None)


@pytest.mark.parametrize("method", ["GET", "POST"])
def test_bad_token_and_unknown_case_are_byte_identical(enrolled, method):
    wrong_token = unsubscribe.lambda_handler(_unsub_event(method, token="f" * 32), None)

    enrolled["table"].get_item.return_value = {}
    unknown_case = unsubscribe.lambda_handler(_unsub_event(method), None)

    other_case = unsubscribe.lambda_handler(
        _unsub_event(method, case_id="vutsrqponmlkjihgfedcba"), None)

    assert wrong_token == unknown_case == other_case
    assert wrong_token["statusCode"] == 400
    enrolled["table"].update_item.assert_not_called()
    enrolled["scheduler"].delete_schedule.assert_not_called()


@pytest.mark.parametrize("case_id, token", [
    (CASE_ID, ""), ("", TOKEN), ("short", TOKEN), (CASE_ID, "x"),
])
def test_missing_or_malformed_parameters_give_the_same_page(enrolled, case_id, token):
    resp = unsubscribe.lambda_handler(_unsub_event("GET", case_id, token), None)
    reference = unsubscribe.lambda_handler(_unsub_event("GET", token="f" * 32), None)
    assert resp == reference


def test_unsubscribe_rejection_logs_no_case_ref(enrolled, caplog):
    caplog.set_level(logging.INFO)
    unsubscribe.lambda_handler(_unsub_event("GET", token="f" * 32), None)
    events = [json.loads(r.getMessage()) for r in caplog.records]
    assert events == [{"event": "unsubscribe", "status": "rejected", "method": "GET"}]
    assert CASE_ID not in caplog.text
    assert REF not in caplog.text
