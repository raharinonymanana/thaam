"""POST /cases/{caseId}/extract - OCR the uploaded screenshot into fields."""
from __future__ import annotations

from datetime import datetime, timezone

from botocore.exceptions import ClientError

from handlers import common
from sms_parser import parse_lines

UNREADABLE_ERRORS = {
    "UnsupportedDocumentException",
    "BadDocumentException",
    "InvalidParameterException",
    "DocumentTooLargeException",
}
# HeadObject has no response body, so the code is the HTTP status. The role
# deliberately has no s3:ListBucket: listing uploads/ would expose every case
# ID. Without it S3 answers 403 instead of 404 for a key that does not exist,
# so both mean "not uploaded yet". The S3 code is logged to tell them apart.
MISSING_OBJECT_CODES = {"404", "NoSuchKey", "403"}


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
        common.log_event("extract", caseRef=ref, status="not_found")
        return common.json_response(404, {
            "error": "not_found", "message": "Case not found.",
        })

    key = common.upload_key(case_id)
    try:
        common.s3().head_object(Bucket=common.BUCKET_NAME, Key=key)
    except ClientError as err:
        s3_code = err.response.get("Error", {}).get("Code")
        if s3_code in MISSING_OBJECT_CODES:
            common.log_event("upload_missing", caseRef=ref, s3Code=s3_code)
            return common.json_response(409, {
                "error": "upload_missing",
                "message": "No screenshot has been uploaded for this case yet.",
            })
        raise

    try:
        result = common.textract().detect_document_text(
            Document={"S3Object": {"Bucket": common.BUCKET_NAME, "Name": key}}
        )
    except ClientError as err:
        code = err.response.get("Error", {}).get("Code")
        if code in UNREADABLE_ERRORS:
            common.log_event("extract", caseRef=ref, status="unreadable", textractCode=code)
            return common.json_response(422, {
                "error": "unreadable",
                "message": "We could not read this image. Please enter the details manually.",
            })
        raise

    lines = [b["Text"] for b in result.get("Blocks", [])
             if b.get("BlockType") == "LINE" and b.get("Text")]
    fields = parse_lines(lines)

    common.cases_table().update_item(
        Key={"caseId": case_id},
        UpdateExpression="SET #fields = :fields, #status = :status, #extractedAt = :extractedAt",
        ExpressionAttributeNames={
            "#fields": "fields", "#status": "status", "#extractedAt": "extractedAt",
        },
        ExpressionAttributeValues={
            ":fields": fields,
            ":status": "extracted",
            ":extractedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
    )

    common.log_event("extract", caseRef=ref, status="extracted",
                     lineCount=len(lines), missingCount=len(fields["missing"]))
    return common.json_response(200, {
        "caseId": case_id, "fields": fields, "lineCount": len(lines),
    })
