import json
import logging
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from handlers import common, plan  # noqa: E402
from plan_builder import build_plan, format_inr, space_digits  # noqa: E402
from working_days import IST, add_working_days, is_bank_working_day  # noqa: E402

CASE_ID = "abcdefghijklmnopqrstuv"

# Confirmed fields as the victim would send them for the TEXTRACT_SAMPLE SMS.
FIELDS = {
    "amount": "49999.00",
    "utr": "426173859012",
    "txn_date": "2026-09-17",
    "txn_time": "10:41:07",
    "account_masked": "XX1234",
    "payee_vpa": "refund.help99@okaxis",
    "payee_phone": None,
    "bank": "Sample Bank",
}
TXN = datetime(2026, 9, 17, 10, 41, 7, tzinfo=IST)

HI_UNAUTHORISED = "यह भुगतान मैंने नहीं किया है और न ही इसकी अनुमति दी है।"
HI_AUTHORISED = "मुझसे धोखे से यह भुगतान करवाया गया है।"


# ---------------- working_days ----------------

def test_sunday_is_not_working_day():
    assert not is_bank_working_day(date(2026, 9, 20))


def test_second_and_fourth_saturdays_are_holidays():
    assert not is_bank_working_day(date(2026, 9, 12))  # 2nd Saturday
    assert not is_bank_working_day(date(2026, 9, 26))  # 4th Saturday


def test_first_and_third_saturdays_are_working():
    assert is_bank_working_day(date(2026, 9, 5))   # 1st Saturday
    assert is_bank_working_day(date(2026, 9, 19))  # 3rd Saturday


def test_national_holidays():
    assert not is_bank_working_day(date(2026, 10, 2))  # a Friday
    assert not is_bank_working_day(date(2026, 1, 26))
    assert not is_bank_working_day(date(2026, 8, 15))
    assert is_bank_working_day(date(2026, 9, 17))


def test_add_working_days_counts_start_day():
    # Thu 17, Fri 18, Sat 19 (3rd Saturday = working).
    assert add_working_days(date(2026, 9, 17), 3) == date(2026, 9, 19)
    assert add_working_days(date(2026, 9, 17), 1) == date(2026, 9, 17)


def test_add_working_days_skips_holidays():
    # From Sat 26 Sep (4th Sat): Mon 28, Tue 29, Wed 30, Thu 1 Oct, (Fri 2 Oct holiday), Sat 3 Oct.
    assert add_working_days(date(2026, 9, 26), 5) == date(2026, 10, 3)


# ---------------- plan_builder ----------------

def _plan(shared="no", fields=FIELDS, now=TXN + timedelta(minutes=20)):
    return build_plan(dict(fields), shared, reported_at=now, now=now)


def test_formatting_helpers():
    assert format_inr("49999.00") == "49,999.00"
    assert format_inr("1234567.5") == "12,34,567.50"
    assert format_inr("250") == "250.00"
    assert space_digits("426173859012") == "4261 7385 9012"


@pytest.mark.parametrize("shared", ["no", "not_sure"])
def test_unauthorised_path(shared):
    p = _plan(shared)
    assert p["path"] == "unauthorised"
    assert p["notSure"] is (shared == "not_sure")
    clocks = p["clocks"]
    assert clocks["bankReport"]["deadline"] == "2026-09-19T23:59:59+05:30"
    assert "RBI circular 6 Jul 2017" in clocks["bankReport"]["rule"]
    assert {"limitedLiability", "shadowCredit", "resolution", "ombudsman"} <= set(clocks)
    assert all(c["estimated"] is True for c in clocks.values())
    ids = [s["id"] for s in p["steps"]]
    assert ids == ["call_1930", "file_ncrp", "keep_ack", "block_payments", "bank_letter"]
    assert p["steps"][-1]["detail"] == "Send the written complaint to your bank before 19 September 2026"


def test_authorised_path():
    p = _plan("yes")
    assert p["path"] == "authorised"
    assert p["notSure"] is False
    assert "bankReport" not in p["clocks"]
    assert "limitedLiability" not in p["clocks"]
    assert p["clocks"]["ombudsman"]["url"] == "https://cms.rbi.org.in"
    ids = [s["id"] for s in p["steps"]]
    assert ids == ["call_1930", "file_ncrp", "keep_ack", "block_payments", "fir", "chakshu"]
    assert p["steps"][0]["tel"] == "1930"
    assert p["steps"][-1]["url"] == "https://sancharsaathi.gov.in"


def test_golden_hour_not_expired():
    gh = _plan(now=TXN + timedelta(minutes=20))["clocks"]["goldenHour"]
    assert gh["deadline"] == "2026-09-17T11:41:07+05:30"
    assert gh["expired"] is False
    assert gh["minutesLeft"] == 40
    assert gh["message"] is None


def test_golden_hour_expired():
    gh = _plan(now=TXN + timedelta(hours=3))["clocks"]["goldenHour"]
    assert gh["expired"] is True
    assert gh["minutesLeft"] == -120
    assert gh["message"] == "Call 1930 anyway — money can still sometimes be frozen."


def test_clock_dates_from_reported_at():
    reported = datetime(2026, 9, 17, 11, 0, tzinfo=IST)
    clocks = _plan(now=reported)["clocks"]
    assert clocks["resolution"]["by"] == "2026-12-16T11:00:00+05:30"
    assert clocks["ombudsman"]["eligibleFrom"] == "2026-10-17T11:00:00+05:30"
    assert clocks["limitedLiability"]["until"].endswith("T23:59:59+05:30")


@pytest.mark.parametrize("shared, hi_line, en_line", [
    ("no", HI_UNAUTHORISED, "I did not make or approve this payment."),
    ("yes", HI_AUTHORISED, "I was tricked into making this payment."),
])
def test_script_content(shared, hi_line, en_line):
    script = _plan(shared)["script"]
    for lang in ("en", "hi"):
        assert "49,999.00" in script[lang]
        assert "4261 7385 9012" in script[lang]
        assert "refund.help99@okaxis" in script[lang]
        assert "1234" in script[lang]
        assert "Sample Bank" in script[lang]
    assert en_line in script["en"]
    assert "17 September 2026 at 10:41" in script["en"]
    assert hi_line in script["hi"]
    assert "17 सितंबर 2026 को 10:41 बजे" in script["hi"]


def test_script_placeholders_for_missing_fields():
    sparse = {"amount": "250", "txn_date": "2026-09-17"}
    p = _plan(fields=sparse)
    en, hi = p["script"]["en"], p["script"]["hi"]
    assert "Rupees 250.00" in en
    assert en.count("[not known]") == 5  # bank, last4, time, utr, payee
    assert hi.count("[पता नहीं]") == 5
    assert p["timeEstimated"] is True
    assert p["clocks"]["goldenHour"]["timeEstimated"] is True
    assert p["clocks"]["goldenHour"]["deadline"] == "2026-09-17T01:00:00+05:30"


def test_payee_phone_used_when_no_vpa():
    fields = dict(FIELDS, payee_vpa=None, payee_phone="9876543210")
    assert "went to 9876543210" in _plan(fields=fields)["script"]["en"]


def test_disclaimers():
    assert len(_plan()["disclaimers"]) == 3
    assert "not legal advice" in _plan()["disclaimers"][1]


# ---------------- handler ----------------

@pytest.fixture
def table(monkeypatch):
    mock = MagicMock()
    mock.get_item.return_value = {"Item": {"caseId": CASE_ID, "status": "extracted"}}
    monkeypatch.setattr(common, "_clients", {"table": mock})
    return mock


def _event(body, case_id=CASE_ID):
    return {"pathParameters": {"caseId": case_id}, "body": json.dumps(body)}


def _call(fields=FIELDS, shared="no", case_id=CASE_ID):
    resp = plan.lambda_handler(_event({"fields": fields, "sharedCredentials": shared}, case_id), None)
    return resp, json.loads(resp["body"])


def test_handler_invalid_case_id_not_logged(table, caplog):
    caplog.set_level(logging.INFO)
    resp, _ = _call(case_id="bad id")
    assert resp["statusCode"] == 400
    assert caplog.records == []
    table.get_item.assert_not_called()


def test_handler_unknown_case(table):
    table.get_item.return_value = {}
    assert _call()[0]["statusCode"] == 404


@pytest.mark.parametrize("status", ["awaiting_upload", None])
def test_handler_wrong_status(table, status):
    table.get_item.return_value = {"Item": {"caseId": CASE_ID, "status": status}}
    resp, body = _call()
    assert resp["statusCode"] == 409
    table.update_item.assert_not_called()


def test_handler_bad_shared_credentials(table):
    resp, body = _call(shared="maybe")
    assert resp["statusCode"] == 400
    assert body["field"] == "sharedCredentials"


def test_handler_rejects_full_account_number(table, caplog):
    caplog.set_level(logging.INFO)
    resp, body = _call(fields=dict(FIELDS, account_masked="123456789012"))
    assert resp["statusCode"] == 400
    assert body["field"] == "account_masked"
    assert "123456789012" not in caplog.text
    table.update_item.assert_not_called()


def test_handler_rejects_future_date(table):
    tomorrow = (datetime.now(IST).date() + timedelta(days=1)).isoformat()
    resp, body = _call(fields=dict(FIELDS, txn_date=tomorrow))
    assert resp["statusCode"] == 400
    assert body["field"] == "txn_date"


@pytest.mark.parametrize("field, value", [
    ("amount", "49,999"), ("amount", None), ("utr", "12345"), ("txn_date", "17-09-2026"),
    ("txn_date", "2026-02-30"), ("txn_time", "25:00"), ("bank", "x" * 101), ("payee_vpa", 42),
])
def test_handler_field_validation(table, field, value):
    resp, body = _call(fields=dict(FIELDS, **{field: value}))
    assert resp["statusCode"] == 400
    assert body["field"] == field


def test_handler_happy_path(table, caplog):
    caplog.set_level(logging.INFO)
    fields = dict(FIELDS, missing=[], direction="debit")  # extra keys are dropped
    resp, body = _call(fields=fields, shared="not_sure")

    assert resp["statusCode"] == 200
    assert set(body) == {"caseId", "path", "notSure", "clocks", "steps", "script", "disclaimers"}
    assert body["caseId"] == CASE_ID
    assert body["path"] == "unauthorised"
    assert body["notSure"] is True
    assert "49,999.00" in body["script"]["en"]

    update = table.update_item.call_args.kwargs
    assert "script" not in json.dumps(update, ensure_ascii=False)
    values = update["ExpressionAttributeValues"]
    assert values[":status"] == "planned"
    assert values[":path"] == "unauthorised"
    assert values[":sharedCredentials"] == "not_sure"
    assert set(values[":confirmedFields"]) == set(FIELDS)
    assert "bankReport" in values[":clocks"]

    assert CASE_ID not in caplog.text
    assert common.case_ref(CASE_ID) in caplog.text
    assert "refund.help99" not in caplog.text


def test_handler_replan_allowed(table):
    table.get_item.return_value = {"Item": {"caseId": CASE_ID, "status": "planned"}}
    resp, body = _call(shared="yes")
    assert resp["statusCode"] == 200
    assert body["path"] == "authorised"
