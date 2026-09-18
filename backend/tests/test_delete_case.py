"""DELETE /cases/{caseId} - "Delete my case now" (D120)."""
import json
import logging
import re
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from handlers import audio, common, delete_case, enroll  # noqa: E402
from plan_builder import build_script_ssml  # noqa: E402

CASE_ID = "abcdefghijklmnopqrstuv"
REF = "f69f9b70d1c9"  # common.case_ref(CASE_ID), asserted below
BUCKET = "thaam-evidence-test"

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

SCHEDULE_NAMES = [f"thaam-{REF}-bank_ack", f"thaam-{REF}-closeout"]


def _item(**overrides):
    item = {
        "caseId": CASE_ID,
        "status": "planned",
        "path": "unauthorised",
        "confirmedFields": dict(FIELDS),
        "plannedAt": "2026-09-17T11:01:07+05:30",
        "expiresAt": 1797000000,
        "reminders": {
            "status": "active",
            "email": "victim@example.com",
            "unsubToken": "deadbeefcafef00ddeadbeefcafef00d",
            "steps": [
                {"step": "bank_ack", "status": "scheduled", "scheduleName": SCHEDULE_NAMES[0]},
                {"step": "liability_window", "status": "skipped", "reason": "deadline_passed"},
                {"step": "closeout", "status": "scheduled", "scheduleName": SCHEDULE_NAMES[1]},
            ],
        },
    }
    item.update(overrides)
    return item


def _expected_audio_keys(item):
    """The keys audio.py itself would use - computed with audio.py's own
    functions, so a change to either side of that contract breaks this."""
    return [audio.audio_key(CASE_ID, lang,
                            build_script_ssml(item["confirmedFields"], item["path"], lang))
            for lang in ("hi", "en")]


@pytest.fixture
def aws(monkeypatch):
    # One parent mock so the ORDER of calls across the three services is
    # visible: that order is the whole safety property of this handler.
    manager = MagicMock()
    table, s3, scheduler = MagicMock(), MagicMock(), MagicMock()
    manager.attach_mock(table, "table")
    manager.attach_mock(s3, "s3")
    manager.attach_mock(scheduler, "scheduler")
    table.get_item.return_value = {"Item": _item()}
    monkeypatch.setattr(common, "_clients",
                        {"table": table, "s3": s3, "scheduler": scheduler})
    monkeypatch.setattr(common, "BUCKET_NAME", BUCKET)
    monkeypatch.setattr(enroll, "SCHEDULE_GROUP", "thaam-reminders")
    return {"manager": manager, "table": table, "s3": s3, "scheduler": scheduler}


def _call(case_id=CASE_ID):
    resp = delete_case.lambda_handler({"pathParameters": {"caseId": case_id}}, None)
    return resp, json.loads(resp["body"])


def _deleted_keys(aws):
    return [c.kwargs["Key"] for c in aws["s3"].delete_object.call_args_list]


def _call_names(aws):
    return [name for name, _args, _kwargs in aws["manager"].mock_calls]


def test_case_ref_matches_the_fixture():
    assert common.case_ref(CASE_ID) == REF


# ---------------- happy path ----------------

def test_deletes_schedules_then_objects_then_the_item(aws):
    resp, body = _call()
    assert resp["statusCode"] == 200
    assert body == {"deleted": True, "remindersCancelled": 2}

    # Schedules first, the item last: the item is the only record of what else
    # exists, so nothing may outlive it.
    names = [n for n in _call_names(aws)
             if n in ("scheduler.delete_schedule", "s3.delete_object", "table.delete_item")]
    assert names == ["scheduler.delete_schedule"] * 2 + ["s3.delete_object"] * 3 \
        + ["table.delete_item"]

    assert [c.kwargs["Name"] for c in aws["scheduler"].delete_schedule.call_args_list] \
        == SCHEDULE_NAMES
    assert all(c.kwargs["GroupName"] == "thaam-reminders"
               for c in aws["scheduler"].delete_schedule.call_args_list)
    aws["table"].delete_item.assert_called_once_with(Key={"caseId": CASE_ID})


def test_deletes_the_upload_and_both_languages_of_audio(aws):
    _call()
    keys = _deleted_keys(aws)
    assert keys[0] == common.upload_key(CASE_ID) == f"uploads/{CASE_ID}"
    assert sorted(keys[1:]) == sorted(_expected_audio_keys(_item()))
    assert len(keys) == 3
    assert all(c.kwargs["Bucket"] == BUCKET for c in aws["s3"].delete_object.call_args_list)


def test_audio_keys_are_the_ones_audio_py_would_serve(aws):
    _call()
    for key in _deleted_keys(aws)[1:]:
        assert re.fullmatch(rf"packs/{CASE_ID}/script-(en|hi)-[0-9a-f]{{16}}\.mp3", key), key
    # Both languages, not the same key twice.
    assert len(set(_deleted_keys(aws)[1:])) == 2


def test_an_authorised_case_has_its_own_audio_keys(aws):
    item = _item(path="authorised")
    aws["table"].get_item.return_value = {"Item": item}
    _call()
    assert sorted(_deleted_keys(aws)[1:]) == sorted(_expected_audio_keys(item))
    # The path is part of the script, so the digest differs from the other path.
    assert set(_deleted_keys(aws)[1:]).isdisjoint(_expected_audio_keys(_item()))


def test_never_lists_the_bucket(aws):
    _call()
    aws["s3"].list_objects_v2.assert_not_called()
    aws["s3"].head_object.assert_not_called()


# ---------------- cases with less to delete ----------------

def test_without_confirmed_fields_only_the_upload_is_deleted(aws):
    aws["table"].get_item.return_value = {"Item": {
        "caseId": CASE_ID, "status": "awaiting_upload", "expiresAt": 1797000000,
    }}
    resp, body = _call()
    assert resp["statusCode"] == 200
    assert body == {"deleted": True, "remindersCancelled": 0}
    assert _deleted_keys(aws) == [common.upload_key(CASE_ID)]
    aws["scheduler"].delete_schedule.assert_not_called()
    aws["table"].delete_item.assert_called_once()


@pytest.mark.parametrize("overrides", [
    {"confirmedFields": None}, {"path": None}, {"confirmedFields": {}},
])
def test_half_a_record_still_deletes_the_upload(aws, overrides):
    aws["table"].get_item.return_value = {"Item": _item(**overrides)}
    resp, _ = _call()
    assert resp["statusCode"] == 200
    assert _deleted_keys(aws) == [common.upload_key(CASE_ID)]


def test_a_record_we_cannot_build_a_script_from_is_not_undeletable(aws, caplog):
    caplog.set_level(logging.INFO)
    # A malformed stored date would raise inside the SSML builder. The case
    # must still delete: no retry would ever fix it.
    aws["table"].get_item.return_value = {"Item": _item(
        confirmedFields=dict(FIELDS, txn_date="not-a-date"))}
    resp, body = _call()
    assert resp["statusCode"] == 200
    assert body["deleted"] is True
    assert _deleted_keys(aws) == [common.upload_key(CASE_ID)]
    assert "audio_key_skipped" in caplog.text
    aws["table"].delete_item.assert_called_once()


def test_a_case_that_never_enrolled_cancels_nothing(aws):
    aws["table"].get_item.return_value = {"Item": _item(reminders=None)}
    resp, body = _call()
    assert body["remindersCancelled"] == 0
    aws["scheduler"].delete_schedule.assert_not_called()
    assert resp["statusCode"] == 200


def test_an_expired_but_unreaped_case_is_deleted_not_refused(aws):
    # GET answers 404 for this; DELETE must not, or data the victim asked us
    # to destroy would sit there until the TTL got round to it.
    aws["table"].get_item.return_value = {"Item": _item(expiresAt=1)}
    resp, body = _call()
    assert resp["statusCode"] == 200
    assert body["deleted"] is True
    aws["table"].delete_item.assert_called_once()


# ---------------- failures ----------------

def _client_error(code, operation="Op"):
    return ClientError({"Error": {"Code": code, "Message": "x"}}, operation)


def test_a_schedule_that_already_fired_is_not_an_error(aws):
    aws["scheduler"].delete_schedule.side_effect = _client_error(
        "ResourceNotFoundException", "DeleteSchedule")
    resp, body = _call()
    assert resp["statusCode"] == 200
    assert body == {"deleted": True, "remindersCancelled": 0}
    aws["table"].delete_item.assert_called_once()


def test_one_gone_schedule_does_not_stop_the_other(aws):
    aws["scheduler"].delete_schedule.side_effect = [
        _client_error("ResourceNotFoundException", "DeleteSchedule"), None,
    ]
    resp, body = _call()
    assert resp["statusCode"] == 200
    assert body["remindersCancelled"] == 1


def test_a_failed_s3_delete_leaves_the_item_in_place(aws, caplog):
    caplog.set_level(logging.INFO)
    aws["s3"].delete_object.side_effect = _client_error("AccessDenied", "DeleteObject")
    resp, body = _call()
    assert resp["statusCode"] == 502
    assert body == {
        "error": "delete_incomplete",
        "message": "We could not finish deleting your case. Please try again.",
    }
    # The item is what tells a retry which schedules and objects to chase.
    aws["table"].delete_item.assert_not_called()
    assert "incomplete" in caplog.text


def test_a_failed_schedule_delete_stops_before_s3(aws):
    aws["scheduler"].delete_schedule.side_effect = _client_error("ThrottlingException")
    resp, _ = _call()
    assert resp["statusCode"] == 502
    aws["s3"].delete_object.assert_not_called()
    aws["table"].delete_item.assert_not_called()


def test_a_retry_after_a_partial_delete_succeeds(aws):
    aws["s3"].delete_object.side_effect = _client_error("ThrottlingException", "DeleteObject")
    assert _call()[0]["statusCode"] == 502

    # Everything is idempotent, so the second press finishes the job.
    aws["s3"].delete_object.side_effect = None
    aws["scheduler"].delete_schedule.side_effect = _client_error(
        "ResourceNotFoundException", "DeleteSchedule")
    resp, body = _call()
    assert resp["statusCode"] == 200
    assert body["deleted"] is True
    aws["table"].delete_item.assert_called_once()


def test_missing_case_is_404(aws):
    aws["table"].get_item.return_value = {}
    resp, body = _call()
    assert resp["statusCode"] == 404
    assert body["error"] == "not_found"
    aws["table"].delete_item.assert_not_called()
    aws["s3"].delete_object.assert_not_called()


@pytest.mark.parametrize("case_id", ["bad id", "short", "", None, "a" * 23])
def test_invalid_case_id_is_rejected_and_never_logged(aws, caplog, case_id):
    caplog.set_level(logging.INFO)
    resp = delete_case.lambda_handler({"pathParameters": {"caseId": case_id}}, None)
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "invalid_case_id"
    assert caplog.records == []
    aws["table"].get_item.assert_not_called()


# ---------------- headers and logging ----------------

def test_cache_control_is_no_store(aws):
    resp, _ = _call()
    assert resp["headers"]["Cache-Control"] == "no-store"


def test_logs_carry_counts_and_the_ref_only(aws, caplog):
    caplog.set_level(logging.INFO)
    _call()
    assert CASE_ID not in caplog.text
    assert REF in caplog.text
    for value in ("victim@example.com", "deadbeefcafef00d", "49999",
                  "426173859012", "XX1234", "Sample Bank", "refund.help99@okaxis"):
        assert value not in caplog.text, value
    assert json.loads(caplog.records[-1].getMessage()) == {
        "event": "delete_case", "caseRef": REF, "status": "deleted",
        "remindersCancelled": 2, "keyCount": 3,
    }


# ---------------- template (least privilege) ----------------

TEMPLATE = (Path(__file__).resolve().parents[2] / "template.yaml").read_text(encoding="utf-8")


def _resource_block(name: str) -> str:
    lines = TEMPLATE.splitlines()
    start = next(i for i, line in enumerate(lines) if line == f"  {name}:")
    end = next((i for i in range(start + 1, len(lines))
                if lines[i].strip() and not lines[i].startswith("    ")), len(lines))
    return "\n".join(lines[start:end])


def test_delete_case_function_has_exactly_the_four_actions():
    block = _resource_block("DeleteCaseFunction")
    assert "Handler: handlers.delete_case.lambda_handler" in block
    assert "Timeout: 10" in block
    # Both spellings the template uses: "Action: one" and a "- " list under it.
    actions = re.findall(r"(?:Action:\s*|^\s+-\s+)([a-z0-9]+:[A-Z][A-Za-z]+)",
                         block, re.MULTILINE)
    assert sorted(actions) == [
        "dynamodb:DeleteItem", "dynamodb:GetItem", "s3:DeleteObject",
        "scheduler:DeleteSchedule",
    ]
    for forbidden in ("PutItem", "UpdateItem", "Query", "Scan", "ListBucket",
                      "GetObject", "PutObject", "CreateSchedule", "ses:", "polly:",
                      "textract:", "iam:"):
        assert forbidden not in block, forbidden


def test_delete_case_function_is_scoped_to_our_own_resources():
    block = _resource_block("DeleteCaseFunction")
    assert "!GetAtt CasesTable.Arn" in block
    assert '!Sub "${EvidenceBucket.Arn}/uploads/*"' in block
    assert '!Sub "${EvidenceBucket.Arn}/packs/*"' in block
    assert "schedule/${ReminderScheduleGroup}/*" in block
    assert not re.search(r'Resource:\s*"\*"', block)


def test_delete_route_and_log_group():
    block = _resource_block("DeleteCaseFunction")
    assert "Method: DELETE" in block
    assert "Path: /cases/{caseId}\n" in block
    log = _resource_block("DeleteCaseLogGroup")
    assert "/aws/lambda/${DeleteCaseFunction}" in log
    assert "RetentionInDays: 14" in log


def test_the_api_allows_the_delete_preflight():
    # Without DELETE here the browser never sends the request at all.
    assert re.search(r"AllowMethods:\s*\[.*\bDELETE\b.*\]", TEMPLATE)


def test_only_the_delete_function_may_delete_objects_or_items():
    for action in ("s3:DeleteObject", "dynamodb:DeleteItem"):
        blocks = [name for name in re.findall(r"^  ([A-Za-z]+Function):$", TEMPLATE, re.MULTILINE)
                  if action in _resource_block(name)]
        assert blocks == ["DeleteCaseFunction"], (action, blocks)
