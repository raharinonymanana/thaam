import json
import logging
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import family_email  # noqa: E402
from handlers import common, family  # noqa: E402
from plan_builder import action_steps  # noqa: E402
from test_reminders import CASE_ID, CLOCKS, FIELDS, REF, SENSITIVE  # noqa: E402

TO = "helper@example.com"
TO_REF = common.address_ref(TO)
EXPIRES_AT = 1765861867


def _item(**overrides):
    item = {
        "caseId": CASE_ID, "status": "planned", "path": "unauthorised",
        "confirmedFields": FIELDS, "clocks": CLOCKS, "expiresAt": EXPIRES_AT,
        "reminders": {"status": "active", "email": "victim@example.com",
                      "unsubToken": "deadbeefcafef00ddeadbeefcafef00d"},
    }
    item.update(overrides)
    return item


# ---------------- family_email (pure) ----------------

def _render(to_name=None, path="unauthorised"):
    return family_email.render(
        steps=action_steps(path, CLOCKS),
        deadline_lines=family_email.deadlines(CLOCKS),
        to_name=to_name,
    )


@pytest.mark.parametrize("path", ["unauthorised", "authorised"])
def test_family_email_has_no_sensitive_field(path):
    message = _render(path=path)
    for part in ("text", "html"):
        for value in SENSITIVE:
            assert value not in message[part], (path, part, value)
        assert "victim@example.com" not in message[part]


def test_family_email_has_no_case_link_or_token():
    message = _render()
    for part in ("text", "html"):
        assert CASE_ID not in message[part]
        assert "/case/" not in message[part]
        assert "unsubscribe" not in message[part].lower()
        assert "deadbeef" not in message[part]
        assert "<img" not in message[part]


FORBIDDEN_IN_DETAILS = ("below", "script", "Thaam prepares", "on screen")


@pytest.mark.parametrize("path", ["unauthorised", "authorised"])
def test_family_step_details_never_point_at_a_missing_script(path):
    # The victim's screen renders the 1930 script under these steps; this email
    # cannot (D103), so no detail may send a helper looking for it.
    steps = family_email.family_steps(
        action_steps(path, CLOCKS), family_email.deadlines(CLOCKS))
    assert steps
    for step in steps:
        detail = (step["detail"] or "").lower()
        for banned in FORBIDDEN_IN_DETAILS:
            assert banned.lower() not in detail, (path, step["title"], banned)

    message = _render(path=path)
    for part in ("text", "html"):
        assert "read out the script below" not in message[part]
        assert "Thaam prepares" not in message[part]


def test_family_email_explains_where_the_wording_lives():
    text = _render()["text"]
    assert ("They have the exact wording to read out in their Thaam case - "
            "ask them to open it.") in text
    assert text.index("ask them to open it") < text.index("What needs doing:")


def test_family_step_details_are_rewritten_for_a_helper():
    steps = {s["title"]: s["detail"] for s in family_email.family_steps(
        action_steps("unauthorised", CLOCKS), family_email.deadlines(CLOCKS))}
    assert steps["Call 1930 now"] == "Call the cyber crime helpline 1930 with them."
    assert steps["Send a written complaint to your bank"] == (
        "Make sure the written complaint reaches their bank by 19 September 2026.")
    assert "cybercrime.gov.in" in steps["File a complaint online"]


def test_family_step_without_known_copy_is_listed_by_title_only():
    steps = family_email.family_steps(
        [{"id": "brand_new_step", "title": "Something new",
          "detail": "Read the script below on screen."}], [])
    assert steps == [{"title": "Something new", "detail": None}]
    message = family_email.render(
        [{"id": "brand_new_step", "title": "Something new",
          "detail": "Read the script below on screen."}], [])
    assert "1. Something new" in message["text"]
    assert "script" not in message["text"]


def test_bank_letter_detail_drops_the_date_when_there_is_no_clock():
    steps = family_email.family_steps(
        [{"id": "bank_letter", "title": "Send a written complaint to your bank",
          "detail": "x"}], [])
    assert steps[0]["detail"] is None


def test_family_email_lists_steps_and_dates():
    message = _render()
    text = message["text"]
    assert "Someone using Thaam asked us to share their next steps" in text
    assert "1. Call 1930 now - Call the cyber crime helpline 1930 with them." in text
    assert "Send a written complaint to your bank" in text
    assert "Written complaint to the bank due by 19 September 2026" in text
    assert "RBI Ombudsman can be approached from 17 October 2026" in text
    assert "not legal advice" in text
    assert "one-off email" in text
    assert message["subject"] == family_email.SUBJECT


def test_family_email_greeting_is_escaped_and_capped():
    assert "Hello Asha," in _render(to_name="Asha")["text"]
    assert _render()["text"].startswith("Hello,")
    evil = _render(to_name="<script>alert(1)</script>")
    assert "<script>" not in evil["html"]
    assert "&lt;script&gt;" in evil["html"]


def test_family_email_omits_dates_it_does_not_have():
    message = family_email.render(steps=action_steps("authorised", {}), deadline_lines=[])
    assert "Dates that matter" not in message["text"]
    assert "Dates that matter" not in message["html"]


# ---------------- handler ----------------

@pytest.fixture
def aws(monkeypatch):
    mocks = {"table": MagicMock(), "sesv2": MagicMock()}
    mocks["table"].get_item.return_value = {"Item": _item()}
    monkeypatch.setattr(common, "_clients", mocks)
    monkeypatch.setattr(family, "SENDER_EMAIL", "reminders@example.com")
    monkeypatch.setattr(family, "MAX_SENDS", 3)
    return mocks


def _client_error(code, operation="Op"):
    return ClientError({"Error": {"Code": code, "Message": "x"}}, operation)


def _share(body=None, case_id=CASE_ID):
    body = {"email": TO} if body is None else body
    event = {"pathParameters": {"caseId": case_id}, "body": json.dumps(body)}
    resp = family.lambda_handler(event, None)
    return resp, json.loads(resp["body"])


def test_share_sends_one_email(aws, caplog):
    caplog.set_level(logging.INFO)
    resp, body = _share({"email": TO, "toName": "Asha"})

    assert resp["statusCode"] == 200
    assert body == {"sent": True, "sendsUsed": 1, "sendsRemaining": 2}
    aws["sesv2"].send_email.assert_called_once()
    sent = aws["sesv2"].send_email.call_args.kwargs
    assert sent["FromEmailAddress"] == "Thaam <reminders@example.com>"
    assert sent["Destination"] == {"ToAddresses": [TO]}
    simple = sent["Content"]["Simple"]
    assert "Hello Asha," in simple["Body"]["Text"]["Data"]
    for part in ("Text", "Html"):
        data = simple["Body"][part]["Data"]
        for value in SENSITIVE:
            assert value not in data, value
        assert CASE_ID not in data


def test_share_creates_no_schedule_and_no_enrolment_state(aws):
    _share()
    assert "scheduler" not in common._clients
    reserved = aws["table"].update_item.call_args_list[0].kwargs
    assert "familySends" in reserved["ExpressionAttributeNames"].values()
    assert all("reminders" not in str(c.kwargs.get("ExpressionAttributeNames", {}))
               for c in aws["table"].update_item.call_args_list)


def test_fourth_send_is_rejected(aws, caplog):
    caplog.set_level(logging.INFO)
    aws["table"].update_item.side_effect = _client_error(
        "ConditionalCheckFailedException", "UpdateItem")
    resp, body = _share()

    assert resp["statusCode"] == 429
    assert body["error"] == "limit_reached"
    aws["sesv2"].send_email.assert_not_called()
    events = [json.loads(r.getMessage()) for r in caplog.records]
    assert events[-1]["status"] == "limit_reached"


def test_send_counter_is_reserved_before_sending(aws):
    _share()
    reserve = aws["table"].update_item.call_args_list[0].kwargs
    assert reserve["ConditionExpression"] == (
        "attribute_not_exists(#familySends) OR #familySends < :max")
    assert reserve["ExpressionAttributeValues"][":max"] == 3


def test_sandbox_rejection_is_422_and_gives_the_slot_back(aws, caplog):
    caplog.set_level(logging.INFO)
    aws["sesv2"].send_email.side_effect = _client_error("MessageRejected", "SendEmail")
    resp, body = _share()

    assert resp["statusCode"] == 422
    assert body["error"] == "address_not_approved"
    assert "pre-approved addresses" in body["message"]
    # Reserved, then released: nothing was sent.
    assert len(aws["table"].update_item.call_args_list) == 2
    release = aws["table"].update_item.call_args_list[1].kwargs
    assert release["UpdateExpression"] == "SET #familySends = #familySends - :one"
    events = [json.loads(r.getMessage()) for r in caplog.records]
    assert events[-1]["status"] == "rejected"
    assert events[-1]["sesCode"] == "MessageRejected"


@pytest.mark.parametrize("error", [
    _client_error("AccessDeniedException", "SendEmail"),
    _client_error("Throttling", "SendEmail"),
    _client_error("AccountSendingPaused", "SendEmail"),
    TimeoutError("read timeout"),
])
def test_any_send_failure_refunds_the_slot_and_still_raises(aws, error):
    # D107: a reservation stops concurrent abuse; it must not charge the caller
    # for our own failures.
    aws["sesv2"].send_email.side_effect = error
    with pytest.raises(type(error)):
        _share()

    assert len(aws["table"].update_item.call_args_list) == 2
    reserve, refund = [c.kwargs for c in aws["table"].update_item.call_args_list]
    assert reserve["UpdateExpression"].startswith("SET #familySends = if_not_exists")
    assert refund["UpdateExpression"] == "SET #familySends = #familySends - :one"
    assert refund["ConditionExpression"] == "#familySends > :zero"


def test_a_failed_refund_does_not_mask_the_send_error(aws):
    aws["sesv2"].send_email.side_effect = _client_error("AccessDeniedException", "SendEmail")
    aws["table"].update_item.side_effect = [None, _client_error("ThrottlingException", "UpdateItem")]
    with pytest.raises(ClientError) as raised:
        _share()
    assert raised.value.response["Error"]["Code"] == "AccessDeniedException"


@pytest.mark.parametrize("email", [None, "", "nope", "a@b", "a b@c.com", 42, "x" * 250 + "@e.com"])
def test_bad_email_is_400(aws, email):
    resp, body = _share({"email": email})
    assert resp["statusCode"] == 400
    assert body["field"] == "email"
    aws["sesv2"].send_email.assert_not_called()
    aws["table"].update_item.assert_not_called()


@pytest.mark.parametrize("to_name", ["x" * 61, 42])
def test_bad_name_is_400(aws, to_name):
    resp, body = _share({"email": TO, "toName": to_name})
    assert resp["statusCode"] == 400
    assert body["field"] == "toName"
    aws["sesv2"].send_email.assert_not_called()


def test_unknown_case_is_404(aws):
    aws["table"].get_item.return_value = {}
    resp, _ = _share()
    assert resp["statusCode"] == 404
    aws["sesv2"].send_email.assert_not_called()


@pytest.mark.parametrize("item", [
    _item(status="extracted"),
    _item(clocks=None),
])
def test_case_without_a_plan_is_409(aws, item):
    aws["table"].get_item.return_value = {"Item": item}
    resp, _ = _share()
    assert resp["statusCode"] == 409
    aws["table"].update_item.assert_not_called()


def test_invalid_case_id_is_not_logged(aws, caplog):
    caplog.set_level(logging.INFO)
    resp, _ = _share(case_id="nope")
    assert resp["statusCode"] == 400
    assert caplog.records == []
    aws["table"].get_item.assert_not_called()


def test_logs_carry_fingerprints_only(aws, caplog):
    caplog.set_level(logging.INFO)
    _share({"email": TO, "toName": "Asha"})

    assert CASE_ID not in caplog.text
    assert TO not in caplog.text
    assert "helper" not in caplog.text
    assert "Asha" not in caplog.text
    events = [json.loads(r.getMessage()) for r in caplog.records]
    assert events[-1]["caseRef"] == REF
    assert events[-1]["toRef"] == TO_REF
    assert len(events[-1]["toRef"]) == 12


def test_address_ref_is_stable_and_case_insensitive():
    assert common.address_ref(TO) == common.address_ref(" HELPER@example.com ")
    assert common.address_ref(TO) != common.address_ref("other@example.com")
