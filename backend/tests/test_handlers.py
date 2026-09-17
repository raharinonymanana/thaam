import json
import logging
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from handlers import common, create_case, extract  # noqa: E402
from test_sms_parser import TEXTRACT_SAMPLE  # noqa: E402

CASE_ID = "abcdefghijklmnopqrstuv"  # 22 URL-safe characters


@pytest.fixture
def aws(monkeypatch):
    """Replace every boto3 client with a mock for the duration of a test."""
    mocks = {"s3": MagicMock(), "textract": MagicMock(), "table": MagicMock()}
    monkeypatch.setattr(common, "_clients", mocks)
    monkeypatch.setattr(common, "BUCKET_NAME", "test-bucket")
    return mocks


def _client_error(code, operation="Op"):
    return ClientError({"Error": {"Code": code, "Message": "x"}}, operation)


def _post(body):
    return {"body": json.dumps(body), "isBase64Encoded": False}


def _extract_event(case_id=CASE_ID):
    return {"pathParameters": {"caseId": case_id}}


def _body(resp):
    return json.loads(resp["body"])


# ---------------- POST /cases ----------------

def test_create_without_consent_is_rejected(aws):
    resp = create_case.lambda_handler(_post({"contentType": "image/png"}), None)
    assert resp["statusCode"] == 400
    assert _body(resp)["error"] == "consent_required"
    assert "consent" in _body(resp)["message"].lower()
    aws["table"].put_item.assert_not_called()


def test_create_consent_must_be_exactly_true(aws):
    resp = create_case.lambda_handler(_post({"consent": "true", "contentType": "image/png"}), None)
    assert resp["statusCode"] == 400
    assert _body(resp)["error"] == "consent_required"


def test_create_bad_content_type_is_rejected(aws):
    resp = create_case.lambda_handler(_post({"consent": True, "contentType": "image/gif"}), None)
    assert resp["statusCode"] == 400
    assert _body(resp)["error"] == "invalid_content_type"
    aws["table"].put_item.assert_not_called()


def test_create_invalid_body_is_rejected(aws):
    resp = create_case.lambda_handler({"body": "{not json"}, None)
    assert resp["statusCode"] == 400
    assert _body(resp)["error"] == "invalid_body"


def test_create_happy_path(aws):
    aws["s3"].generate_presigned_post.return_value = {
        "url": "https://test-bucket.s3.amazonaws.com/",
        "fields": {"key": "uploads/x", "Content-Type": "image/jpeg"},
    }
    resp = create_case.lambda_handler(_post({"consent": True, "contentType": "image/jpeg"}), None)

    assert resp["statusCode"] == 201
    assert resp["headers"]["Content-Type"] == "application/json"
    body = _body(resp)
    assert common.is_valid_case_id(body["caseId"])
    assert body["expiresInSeconds"] == 300
    assert body["upload"]["url"].startswith("https://")

    put = aws["table"].put_item.call_args.kwargs
    item = put["Item"]
    assert item["caseId"] == body["caseId"]
    assert item["status"] == "awaiting_upload"
    assert isinstance(item["expiresAt"], int)
    assert put["ConditionExpression"] == "attribute_not_exists(caseId)"

    post = aws["s3"].generate_presigned_post.call_args.kwargs
    assert post["Bucket"] == "test-bucket"
    assert post["Key"] == f"uploads/{body['caseId']}"
    assert post["ExpiresIn"] == 300
    assert {"Content-Type": "image/jpeg"} in post["Conditions"]
    assert ["content-length-range", 1, 5242880] in post["Conditions"]


# ---------------- POST /cases/{caseId}/extract ----------------

def test_extract_invalid_case_id(aws):
    resp = extract.lambda_handler(_extract_event("../etc/passwd"), None)
    assert resp["statusCode"] == 400
    aws["table"].get_item.assert_not_called()


def test_extract_unknown_case(aws):
    aws["table"].get_item.return_value = {}
    resp = extract.lambda_handler(_extract_event(), None)
    assert resp["statusCode"] == 404


def test_extract_missing_upload(aws):
    aws["table"].get_item.return_value = {"Item": {"caseId": CASE_ID}}
    aws["s3"].head_object.side_effect = _client_error("404", "HeadObject")
    resp = extract.lambda_handler(_extract_event(), None)
    assert resp["statusCode"] == 409
    aws["textract"].detect_document_text.assert_not_called()


def test_extract_unreadable_image(aws):
    aws["table"].get_item.return_value = {"Item": {"caseId": CASE_ID}}
    aws["textract"].detect_document_text.side_effect = _client_error(
        "UnsupportedDocumentException", "DetectDocumentText")
    resp = extract.lambda_handler(_extract_event(), None)
    assert resp["statusCode"] == 422
    assert _body(resp) == {
        "error": "unreadable",
        "message": "We could not read this image. Please enter the details manually.",
    }
    aws["table"].update_item.assert_not_called()


def test_extract_happy_path(aws):
    aws["table"].get_item.return_value = {"Item": {"caseId": CASE_ID}}
    blocks = [{"BlockType": "PAGE"}]
    blocks += [{"BlockType": "LINE", "Text": t} for t in TEXTRACT_SAMPLE]
    blocks += [{"BlockType": "WORD", "Text": "VM-SMPLBK"}]
    aws["textract"].detect_document_text.return_value = {"Blocks": blocks}

    resp = extract.lambda_handler(_extract_event(), None)

    assert resp["statusCode"] == 200
    body = _body(resp)
    assert body["caseId"] == CASE_ID
    assert body["lineCount"] == len(TEXTRACT_SAMPLE)
    assert body["fields"]["payee_vpa"] == "refund.help99@okaxis"

    aws["textract"].detect_document_text.assert_called_once_with(
        Document={"S3Object": {"Bucket": "test-bucket", "Name": f"uploads/{CASE_ID}"}})
    update = aws["table"].update_item.call_args.kwargs
    values = update["ExpressionAttributeValues"]
    assert values[":status"] == "extracted"
    assert values[":fields"] == body["fields"]
    # Only the parsed fields are persisted - no raw OCR lines.
    assert set(values) == {":fields", ":status", ":extractedAt"}
    assert "Synthetic test image" not in json.dumps(update)


# ---------------- Logging: no full case IDs ----------------

def test_case_ref_is_short_stable_and_distinct():
    ref = common.case_ref(CASE_ID)
    assert len(ref) == 12
    assert all(c in "0123456789abcdef" for c in ref)
    assert common.case_ref(CASE_ID) == ref
    assert common.case_ref("vutsrqponmlkjihgfedcba") != ref


def _log_events(caplog):
    return [json.loads(r.getMessage()) for r in caplog.records]


def test_create_logs_case_ref_not_case_id(aws, caplog):
    caplog.set_level(logging.INFO)
    aws["s3"].generate_presigned_post.return_value = {"url": "https://x/", "fields": {}}
    resp = create_case.lambda_handler(_post({"consent": True, "contentType": "image/png"}), None)
    case_id = _body(resp)["caseId"]

    assert case_id not in caplog.text
    assert common.case_ref(case_id) in caplog.text
    assert _log_events(caplog) == [
        {"event": "case_created", "caseRef": common.case_ref(case_id), "status": "awaiting_upload"}
    ]


def test_extract_happy_path_logs_case_ref_not_case_id(aws, caplog):
    caplog.set_level(logging.INFO)
    aws["table"].get_item.return_value = {"Item": {"caseId": CASE_ID}}
    aws["textract"].detect_document_text.return_value = {
        "Blocks": [{"BlockType": "LINE", "Text": t} for t in TEXTRACT_SAMPLE]}
    resp = extract.lambda_handler(_extract_event(), None)

    assert resp["statusCode"] == 200
    assert CASE_ID not in caplog.text
    assert common.case_ref(CASE_ID) in caplog.text
    # No OCR text or field values either.
    assert "refund.help99" not in caplog.text
    assert "49999" not in caplog.text


def test_extract_upload_missing_logs_case_ref_not_case_id(aws, caplog):
    caplog.set_level(logging.INFO)
    aws["table"].get_item.return_value = {"Item": {"caseId": CASE_ID}}
    aws["s3"].head_object.side_effect = _client_error("403", "HeadObject")
    resp = extract.lambda_handler(_extract_event(), None)

    assert resp["statusCode"] == 409
    assert CASE_ID not in caplog.text
    assert _log_events(caplog) == [
        {"event": "upload_missing", "caseRef": common.case_ref(CASE_ID), "s3Code": "403"}
    ]


def test_extract_invalid_case_id_is_not_logged(aws, caplog):
    caplog.set_level(logging.INFO)
    bad_id = "not-a-valid-case-id!!"
    resp = extract.lambda_handler(_extract_event(bad_id), None)

    assert resp["statusCode"] == 400
    assert caplog.records == []
    assert common.case_ref(bad_id) not in caplog.text
