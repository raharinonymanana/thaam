import io
import json
import logging
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from handlers import audio, common  # noqa: E402
from plan_builder import build_script_ssml  # noqa: E402

CASE_ID = "abcdefghijklmnopqrstuv"

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


def _ssml(fields=FIELDS, path="unauthorised", lang="en"):
    return build_script_ssml(dict(fields), path, lang)


# ---------------- build_script_ssml ----------------

# The shape accepted on real Polly (D78) for the sample case, English.
SAMPLE_EN = (
    '<speak><prosody rate="90%">Hello, I want to report a cyber fraud.<break time="400ms"/>'
    'Rupees 49,999 was debited from my Sample Bank account ending </prosody>'
    '<prosody rate="80%">1<break time="150ms"/>2<break time="150ms"/>3<break time="150ms"/>4</prosody>'
    '<prosody rate="90%"> on </prosody><prosody rate="80%">17 September 2026</prosody>'
    '<prosody rate="90%"> at </prosody><prosody rate="80%">10:41</prosody>'
    '<prosody rate="90%">.<break time="400ms"/>The UPI reference number, the UTR, is </prosody>'
    '<prosody rate="80%">4<break time="150ms"/>2<break time="150ms"/>6<break time="150ms"/>1</prosody>'
    '<break time="700ms"/>'
    '<prosody rate="80%">7<break time="150ms"/>3<break time="150ms"/>8<break time="150ms"/>5</prosody>'
    '<break time="700ms"/>'
    '<prosody rate="80%">9<break time="150ms"/>0<break time="150ms"/>1<break time="150ms"/>2</prosody>'
    '<prosody rate="90%">.<break time="400ms"/>The money went to refund dot help99 at okaxis.'
    '<break time="400ms"/>I did not make or approve this payment.<break time="400ms"/>'
    'Then say your name and your mobile number.</prosody></speak>'
)


def _blocks(ssml):
    """Top-level children of <speak>: ('90%'|'80%', digits-or-text) or ('gap', time)."""
    root = ET.fromstring(ssml)
    out = []
    for child in root:
        if child.tag == "prosody":
            out.append((child.get("rate"), "".join(child.itertext())))
        else:
            assert child.tag == "break"
            out.append(("gap", child.get("time")))
    return out


def test_sample_matches_accepted_shape():
    assert _ssml(lang="en") == SAMPLE_EN


@pytest.mark.parametrize("lang", ["en", "hi"])
@pytest.mark.parametrize("path", ["unauthorised", "authorised"])
def test_ssml_is_flat_prosody_blocks(lang, path):
    ssml = _ssml(path=path, lang=lang)
    root = ET.fromstring(ssml)
    assert root.tag == "speak"
    assert "say-as" not in ssml
    for child in root:
        assert child.tag in ("prosody", "break")
        if child.tag == "prosody":
            assert child.get("rate") in ("90%", "80%")
            assert child.find(".//prosody") is None  # no nesting
        else:
            assert child.get("time") == "700ms"
    sentence_breaks = [b for b in root.iter("break") if b.get("time") == "400ms"]
    assert len(sentence_breaks) == 5  # 6 sentences


def _slow_digit_blocks(ssml):
    root = ET.fromstring(ssml)
    blocks = []
    for child in root:
        if child.tag == "prosody" and child.get("rate") == "80%":
            text = "".join(child.itertext())
            if text.isdigit():
                breaks = [b.get("time") for b in child.iter("break")]
                assert breaks == ["150ms"] * (len(text) - 1)  # one pause between digits
                blocks.append(text)
    return blocks


@pytest.mark.parametrize("lang", ["en", "hi"])
def test_utr_is_twelve_slow_digits_in_three_blocks(lang):
    ssml = _ssml(lang=lang)
    blocks = _blocks(ssml)
    utr_start = blocks.index(("80%", "4261"))
    assert blocks[utr_start:utr_start + 5] == [
        ("80%", "4261"), ("gap", "700ms"), ("80%", "7385"), ("gap", "700ms"), ("80%", "9012"),
    ]
    assert "".join(_slow_digit_blocks(ssml)[1:]) == "426173859012"
    assert [b for b in blocks if b[0] == "gap"] == [("gap", "700ms")] * 2


@pytest.mark.parametrize("lang, date_text", [("en", "17 September 2026"), ("hi", "17 सितंबर 2026")])
def test_date_time_and_account_are_slow(lang, date_text):
    blocks = _blocks(_ssml(lang=lang))
    assert ("80%", date_text) in blocks
    assert ("80%", "10:41") in blocks
    assert ("80%", "1234") in blocks
    # Account last 4 comes before the UTR in both languages.
    assert _slow_digit_blocks(_ssml(lang=lang)) == ["1234", "4261", "7385", "9012"]


@pytest.mark.parametrize("lang", ["en", "hi"])
def test_payee_phone_is_two_slow_groups_of_five(lang):
    fields = dict(FIELDS, payee_vpa=None, payee_phone="9876543210")
    ssml = _ssml(fields, lang=lang)
    blocks = _blocks(ssml)
    phone_start = blocks.index(("80%", "98765"))
    assert blocks[phone_start:phone_start + 3] == [("80%", "98765"), ("gap", "700ms"), ("80%", "43210")]
    assert _slow_digit_blocks(ssml) == ["1234", "4261", "7385", "9012", "98765", "43210"]
    assert len([b for b in blocks if b[0] == "gap"]) == 3


def test_amount_drops_zero_paise_only():
    assert "Rupees 49,999 was debited" in _ssml()
    assert "49,999.00" not in _ssml()
    assert "Rupees 49,999.50 was debited" in _ssml(dict(FIELDS, amount="49999.50"))
    assert "49,999 रुपये" in _ssml(lang="hi")


def test_upi_id_is_spoken():
    assert "refund dot help99 at okaxis" in _ssml(lang="en")
    assert "refund डॉट help99 ऐट okaxis" in _ssml(lang="hi")
    assert "@" not in _ssml()


def test_closing_sentence_replaces_placeholders():
    assert _ssml(lang="en").endswith(
        '<break time="400ms"/>Then say your name and your mobile number.</prosody></speak>')
    assert "फिर अपना नाम" in _ssml(lang="hi")


@pytest.mark.parametrize("lang, unknown", [("en", "not known"), ("hi", "पता नहीं")])
def test_missing_fields_have_no_brackets(lang, unknown):
    ssml = _ssml({"amount": "250", "txn_date": "2026-09-17"}, lang=lang)
    ET.fromstring(ssml)
    assert "[" not in ssml and "]" not in ssml
    assert ssml.count(unknown) == 5  # bank, last4, time, utr, payee
    for path in ("authorised", "unauthorised"):
        assert "[" not in _ssml(path=path, lang=lang)


@pytest.mark.parametrize("lang", ["en", "hi"])
def test_ssml_injection_is_escaped(lang):
    evil = '</speak><break time="10s"/>&'
    fields = dict(FIELDS, bank=evil, payee_vpa=None, payee_phone='<prosody rate="10%">')
    ssml = _ssml(fields, lang=lang)

    root = ET.fromstring(ssml)  # still parses: a single root
    assert root.tag == "speak"
    assert list(root.iter("speak")) == [root]
    assert not [b for b in root.iter("break") if b.get("time") == "10s"]
    assert {p.get("rate") for p in root.iter("prosody")} == {"90%", "80%"}
    assert all(p.find(".//prosody") is None for p in root.iter("prosody"))
    assert "&lt;/speak&gt;&lt;break time=\"10s\"/&gt;&amp;" in ssml
    # The text Polly will speak still contains the literal value.
    assert evil in "".join(root.itertext())


# ---------------- handler ----------------

@pytest.fixture
def aws(monkeypatch):
    mocks = {"s3": MagicMock(), "polly": MagicMock(), "table": MagicMock()}
    mocks["table"].get_item.return_value = {"Item": {
        "caseId": CASE_ID, "status": "planned", "path": "unauthorised", "confirmedFields": FIELDS,
    }}
    mocks["s3"].generate_presigned_url.return_value = "https://test-bucket.s3.amazonaws.com/signed"
    mocks["polly"].synthesize_speech.return_value = {"AudioStream": io.BytesIO(b"ID3fake-mp3")}
    monkeypatch.setattr(common, "_clients", mocks)
    monkeypatch.setattr(common, "BUCKET_NAME", "test-bucket")
    return mocks


def _client_error(code, operation="Op"):
    return ClientError({"Error": {"Code": code, "Message": "x"}}, operation)


def _call(lang="hi", case_id=CASE_ID):
    event = {"pathParameters": {"caseId": case_id}, "queryStringParameters": {"lang": lang}}
    resp = audio.lambda_handler(event, None)
    return resp, json.loads(resp["body"])


def test_handler_invalid_case_id_not_logged(aws, caplog):
    caplog.set_level(logging.INFO)
    resp, _ = _call(case_id="bad")
    assert resp["statusCode"] == 400
    assert caplog.records == []


@pytest.mark.parametrize("lang", ["fr", "", None, "HI"])
def test_handler_bad_lang(aws, lang):
    resp, body = _call(lang=lang)
    assert resp["statusCode"] == 400
    assert body["error"] == "invalid_lang"
    aws["table"].get_item.assert_not_called()


def test_handler_missing_query_string(aws):
    resp = audio.lambda_handler({"pathParameters": {"caseId": CASE_ID}}, None)
    assert resp["statusCode"] == 400


def test_handler_unknown_case(aws):
    aws["table"].get_item.return_value = {}
    assert _call()[0]["statusCode"] == 404


@pytest.mark.parametrize("status", ["extracted", "awaiting_upload"])
def test_handler_not_planned(aws, status):
    aws["table"].get_item.return_value = {"Item": {"caseId": CASE_ID, "status": status}}
    resp, body = _call()
    assert resp["statusCode"] == 409
    aws["polly"].synthesize_speech.assert_not_called()


def test_handler_cache_hit(aws, caplog):
    caplog.set_level(logging.INFO)
    aws["s3"].head_object.return_value = {"ContentLength": 1234}
    resp, body = _call(lang="en")

    assert resp["statusCode"] == 200
    assert body == {"lang": "en", "url": "https://test-bucket.s3.amazonaws.com/signed",
                    "expiresInSeconds": 600, "cached": True}
    aws["polly"].synthesize_speech.assert_not_called()
    aws["s3"].put_object.assert_not_called()
    key = aws["s3"].head_object.call_args.kwargs["Key"]
    assert key.startswith(f"packs/{CASE_ID}/script-en-") and key.endswith(".mp3")
    assert len(key.rsplit("-", 1)[1]) == len("0123456789abcdef.mp3")


@pytest.mark.parametrize("head_code", ["403", "404"])
def test_handler_cache_miss_generates(aws, caplog, head_code):
    caplog.set_level(logging.INFO)
    aws["s3"].head_object.side_effect = _client_error(head_code, "HeadObject")
    resp, body = _call(lang="hi")

    assert resp["statusCode"] == 200
    assert body["cached"] is False

    speech = aws["polly"].synthesize_speech.call_args.kwargs
    assert speech["TextType"] == "ssml"
    assert speech["Engine"] == "neural"
    assert speech["VoiceId"] == "Kajal"
    assert speech["LanguageCode"] == "hi-IN"
    assert speech["OutputFormat"] == "mp3"
    assert speech["Text"] == build_script_ssml(FIELDS, "unauthorised", "hi")

    put = aws["s3"].put_object.call_args.kwargs
    assert put["Bucket"] == "test-bucket"
    assert put["Key"].startswith(f"packs/{CASE_ID}/script-hi-")
    assert put["ContentType"] == "audio/mpeg"
    assert put["Body"] == b"ID3fake-mp3"

    presign = aws["s3"].generate_presigned_url.call_args
    assert presign.args == ("get_object",)
    assert presign.kwargs["ExpiresIn"] == 600
    assert presign.kwargs["Params"] == {"Bucket": "test-bucket", "Key": put["Key"]}


def test_handler_key_changes_with_ssml(aws):
    aws["s3"].head_object.return_value = {}
    _call(lang="en")
    first = aws["s3"].head_object.call_args.kwargs["Key"]
    aws["table"].get_item.return_value["Item"]["path"] = "authorised"
    _call(lang="en")
    assert aws["s3"].head_object.call_args.kwargs["Key"] != first


def test_handler_other_head_errors_raise(aws):
    aws["s3"].head_object.side_effect = _client_error("500", "HeadObject")
    with pytest.raises(ClientError):
        _call()


@pytest.mark.parametrize("code", ["InvalidSsmlException", "TextLengthExceededException"])
def test_handler_polly_error(aws, caplog, code):
    caplog.set_level(logging.INFO)
    aws["s3"].head_object.side_effect = _client_error("404", "HeadObject")
    aws["polly"].synthesize_speech.side_effect = _client_error(code, "SynthesizeSpeech")
    resp, body = _call()

    assert resp["statusCode"] == 502
    assert body == {"error": "audio_unavailable",
                    "message": "Audio is unavailable right now. Please read the script on screen."}
    aws["s3"].put_object.assert_not_called()
    assert code in caplog.text
    assert CASE_ID not in caplog.text
    assert "<speak>" not in caplog.text


@pytest.mark.parametrize("head", [{}, _client_error("403", "HeadObject")])
def test_handler_logs_never_contain_case_id_or_ssml(aws, caplog, head):
    caplog.set_level(logging.INFO)
    if isinstance(head, Exception):
        aws["s3"].head_object.side_effect = head
    else:
        aws["s3"].head_object.return_value = head
    _call(lang="en")

    ssml = build_script_ssml(FIELDS, "unauthorised", "en")
    assert CASE_ID not in caplog.text
    assert "speak" not in caplog.text
    assert "refund" not in caplog.text and "4261" not in caplog.text
    events = [json.loads(r.getMessage()) for r in caplog.records]
    assert events[-1]["caseRef"] == common.case_ref(CASE_ID)
    assert events[-1]["lang"] == "en"
    assert events[-1]["ssmlChars"] == len(ssml)
    assert isinstance(events[-1]["cached"], bool)
