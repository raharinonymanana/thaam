"""POST /cases - open a case and hand back a presigned S3 upload form."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from handlers import common

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
UPLOAD_EXPIRES_SECONDS = 300
CASE_TTL_DAYS = 90


def lambda_handler(event, context):
    body = common.parse_json_body(event)
    if not isinstance(body, dict):
        return common.json_response(400, {
            "error": "invalid_body",
            "message": "Request body must be a JSON object.",
        })
    if body.get("consent") is not True:
        return common.json_response(400, {
            "error": "consent_required",
            "message": "Your consent is required before we can store your screenshot "
                       "and case details. Please tick the consent box to continue.",
        })
    content_type = body.get("contentType")
    if content_type not in ALLOWED_CONTENT_TYPES:
        return common.json_response(400, {
            "error": "invalid_content_type",
            "message": "Only PNG or JPEG screenshots are accepted.",
        })

    case_id = common.new_case_id()
    now = datetime.now(timezone.utc)
    common.cases_table().put_item(
        Item={
            "caseId": case_id,
            "createdAt": now.isoformat(timespec="seconds"),
            "status": "awaiting_upload",
            "expiresAt": int((now + timedelta(days=CASE_TTL_DAYS)).timestamp()),
        },
        ConditionExpression="attribute_not_exists(caseId)",
    )

    upload = common.s3().generate_presigned_post(
        Bucket=common.BUCKET_NAME,
        Key=common.upload_key(case_id),
        Fields={"Content-Type": content_type},
        Conditions=[
            {"Content-Type": content_type},
            ["content-length-range", 1, MAX_UPLOAD_BYTES],
        ],
        ExpiresIn=UPLOAD_EXPIRES_SECONDS,
    )

    logger.info("case created caseId=%s status=awaiting_upload", case_id)
    return common.json_response(201, {
        "caseId": case_id,
        "upload": {"url": upload["url"], "fields": upload["fields"]},
        "expiresInSeconds": UPLOAD_EXPIRES_SECONDS,
    })
