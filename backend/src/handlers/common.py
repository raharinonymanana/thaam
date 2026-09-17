"""Shared helpers for Thaam's Lambda handlers."""
from __future__ import annotations

import base64
import json
import os
import re
import secrets

import boto3
from botocore.config import Config

TABLE_NAME = os.environ.get("TABLE_NAME", "")
BUCKET_NAME = os.environ.get("BUCKET_NAME", "")

_CASE_ID = re.compile(r"^[A-Za-z0-9_-]{22}$")

# Created on first use and reused across warm invocations. Tests replace
# entries in this dict with mocks, so nothing ever touches the network.
_clients: dict = {}


def s3():
    if "s3" not in _clients:
        _clients["s3"] = boto3.client(
            "s3",
            region_name=os.environ.get("AWS_REGION"),
            config=Config(signature_version="s3v4"),
        )
    return _clients["s3"]


def textract():
    if "textract" not in _clients:
        _clients["textract"] = boto3.client("textract")
    return _clients["textract"]


def cases_table():
    if "table" not in _clients:
        _clients["table"] = boto3.resource("dynamodb").Table(TABLE_NAME)
    return _clients["table"]


def json_response(status: int, body) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def parse_json_body(event: dict):
    """Return the decoded JSON body, or None if it is missing or invalid."""
    raw = event.get("body")
    if not raw:
        return None
    try:
        if event.get("isBase64Encoded"):
            raw = base64.b64decode(raw).decode("utf-8")
        return json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        return None


def new_case_id() -> str:
    return secrets.token_urlsafe(16)


def is_valid_case_id(value) -> bool:
    return isinstance(value, str) and bool(_CASE_ID.match(value))


def upload_key(case_id: str) -> str:
    return f"uploads/{case_id}"
