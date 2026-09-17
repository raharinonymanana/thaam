"""Shared helpers for Thaam's Lambda handlers."""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import re
import secrets

import boto3
from botocore.config import Config

TABLE_NAME = os.environ.get("TABLE_NAME", "")
BUCKET_NAME = os.environ.get("BUCKET_NAME", "")

_CASE_ID = re.compile(r"^[A-Za-z0-9_-]{22}$")

logger = logging.getLogger()
logger.setLevel(logging.INFO)

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


def polly():
    if "polly" not in _clients:
        _clients["polly"] = boto3.client("polly")
    return _clients["polly"]


def scheduler():
    if "scheduler" not in _clients:
        _clients["scheduler"] = boto3.client("scheduler")
    return _clients["scheduler"]


def sesv2():
    if "sesv2" not in _clients:
        _clients["sesv2"] = boto3.client("sesv2")
    return _clients["sesv2"]


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


def html_response(status: int, html: str) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "text/html; charset=utf-8"},
        "body": html,
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


def case_ref(case_id: str) -> str:
    """Short, stable, non-reversible reference to a case for logs.

    The case ID is the only secret needed to act on a case, so it never
    goes into logs; this hash still lets log lines for one case be joined.
    """
    return hashlib.sha256(case_id.encode("utf-8")).hexdigest()[:12]


def address_ref(address: str) -> str:
    """Fingerprint of an email address for logs. The address itself is personal
    data and never appears in a log line; this still lets sends be counted."""
    return hashlib.sha256(address.strip().lower().encode("utf-8")).hexdigest()[:12]


def log_event(event: str, **fields) -> None:
    """Log one JSON line. Callers pass only refs, statuses, counts and codes."""
    logger.info(json.dumps({"event": event, **fields}))
