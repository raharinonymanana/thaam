#!/usr/bin/env python3
"""Live end-to-end smoke test: create -> upload -> extract -> plan -> reminders.

Runs against a deployed stack and touches real AWS (Textract, SES, Scheduler),
so it costs a little money and sends a real email. Nothing here mutates
infrastructure; it only calls the public HTTP API.

    python backend/scripts/smoke_reminders.py \
        --api-url https://abc123.execute-api.us-east-1.amazonaws.com \
        --email you@example.com --demo

The case ID is the victim's only credential, so it is never printed: stdout
gets the same 12-hex fingerprint the Lambdas log, and the full ID is written to
backend/scripts/.last_case (git-ignored) for follow-up calls by hand.

Standard library only - requests is not a dependency of this repo.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import secrets
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")
LAST_CASE = Path(__file__).resolve().parent / ".last_case"
DEFAULT_IMAGE = Path.home() / "aws-scratch" / "sms-sample.png"
ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg"}
TIMEOUT = 30


class SmokeError(RuntimeError):
    """A step failed: non-2xx, a timeout, or a response we cannot use."""


def case_ref(case_id: str) -> str:
    """Same fingerprint as handlers.common.case_ref."""
    return hashlib.sha256(case_id.encode("utf-8")).hexdigest()[:12]


# ---------------- tiny HTTP helper ----------------

def _request(method: str, url: str, *, data: bytes | None = None,
             content_type: str | None = None) -> tuple[int, bytes, float]:
    headers = {"Content-Type": content_type} if content_type else {}
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            body = response.read()
            status = response.status
    except urllib.error.HTTPError as err:  # 4xx/5xx still carry a useful body
        body, status = err.read(), err.code
    except (urllib.error.URLError, TimeoutError) as err:
        raise SmokeError(f"{method} {url} failed: {err}") from err
    return status, body, (time.perf_counter() - started) * 1000


def _step(number: int, name: str, method: str, url: str, *, payload=None,
          data: bytes | None = None, content_type: str | None = None) -> dict:
    """Run one step, print status and elapsed ms, and return the parsed body."""
    if payload is not None:
        data, content_type = json.dumps(payload).encode("utf-8"), "application/json"
    status, body, elapsed = _request(method, url, data=data, content_type=content_type)
    ok = 200 <= status < 300
    print(f"[{number}] {name:<22} {status}  {elapsed:7.0f} ms  {'ok' if ok else 'FAILED'}")
    if not ok:
        print(_indent(body.decode("utf-8", "replace")[:800]))
        raise SmokeError(f"step {number} ({name}) returned {status}")
    if not body:
        return {}
    try:
        return json.loads(body)
    except ValueError:
        return {"raw": body.decode("utf-8", "replace")}


def _indent(text: str, prefix: str = "      ") -> str:
    return "\n".join(prefix + line for line in text.splitlines())


def _field(label: str, value) -> None:
    print(f"      {label:<18} {value}")


# ---------------- presigned POST upload ----------------

def _multipart(fields: dict, filename: str, file_bytes: bytes,
               content_type: str) -> tuple[bytes, str]:
    """Encode an S3 presigned POST. The file part must come last."""
    boundary = "----thaam" + secrets.token_hex(16)
    parts = []
    for name, value in fields.items():
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'
            .encode("utf-8"))
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
    parts.append(file_bytes)
    parts.append(f"\r\n--{boundary}--\r\n".encode("utf-8"))
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


# ---------------- output helpers ----------------

def _ist(moment: str) -> str:
    try:
        return datetime.fromisoformat(moment).astimezone(IST).strftime("%Y-%m-%d %H:%M:%S IST")
    except (TypeError, ValueError):
        return str(moment)


def _print_step_table(steps: list, skipped: list) -> None:
    print()
    print(f"      {'STEP':<18} {'FIRES (IST)':<26} {'URGENT':<7} REASON")
    print(f"      {'-' * 18} {'-' * 26} {'-' * 7} {'-' * 18}")
    for entry in steps:
        urgent = "yes" if entry.get("urgent") else "-"
        print(f"      {entry['step']:<18} {_ist(entry.get('fireAt')):<26} {urgent:<7} -")
    for entry in skipped:
        print(f"      {entry['step']:<18} {'not scheduled':<26} {'-':<7} "
              f"{entry.get('reason', 'unknown')}")
    print()
    print(f"      scheduled: {len(steps)}   skipped: {len(skipped)}")


def _print_clocks(clocks: dict) -> None:
    for name in ("goldenHour", "bankReport", "limitedLiability", "shadowCredit",
                 "ombudsman", "resolution"):
        clock = clocks.get(name)
        if not clock:
            continue
        moment = clock.get("deadline") or clock.get("until") or clock.get("by") \
            or clock.get("eligibleFrom")
        _field(name, _ist(moment))


# ---------------- the smoke test ----------------

def run(args) -> int:
    api = args.api_url.rstrip("/")
    image = Path(args.image).expanduser()
    if not image.is_file():
        raise SmokeError(f"image not found: {image}")
    content_type = args.content_type or mimetypes.guess_type(image.name)[0]
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise SmokeError(f"content type must be PNG or JPEG, got {content_type}")

    print(f"api      {api}")
    print(f"image    {image}  ({image.stat().st_size} bytes, {content_type})")
    print(f"triage   sharedCredentials={args.shared_credentials}"
          f"  -> {'authorised' if args.shared_credentials == 'yes' else 'unauthorised'} path")
    print(f"demo     {args.demo}")
    print()

    # 1. open a case
    created = _step(1, "create case", "POST", f"{api}/cases",
                    payload={"consent": True, "contentType": content_type})
    case_id = created["caseId"]
    ref = case_ref(case_id)
    _field("caseRef", ref)
    _field("expiresIn", f"{created.get('expiresInSeconds')} s")
    LAST_CASE.write_text(json.dumps({
        "caseId": case_id,
        "caseRef": ref,
        "apiUrl": api,
        "createdAt": datetime.now(IST).isoformat(timespec="seconds"),
    }, indent=2) + "\n", encoding="utf-8")
    _field("case written to", LAST_CASE)

    # 2. upload straight to S3 with the presigned POST
    upload = created["upload"]
    body, upload_content_type = _multipart(
        upload["fields"], image.name, image.read_bytes(), content_type)
    _step(2, "upload screenshot", "POST", upload["url"],
          data=body, content_type=upload_content_type)
    _field("bytes", len(body))

    # 3. OCR
    extracted = _step(3, "extract", "POST", f"{api}/cases/{case_id}/extract")
    fields = extracted.get("fields", {})
    _field("lineCount", extracted.get("lineCount"))
    _field("missing", fields.get("missing"))
    for name in ("amount", "utr", "txn_date", "txn_time", "account_masked",
                 "payee_vpa", "payee_phone", "bank", "direction"):
        if fields.get(name):
            _field(name, fields[name])

    # 4. plan. The path comes from this answer, not from the screenshot.
    plan = _step(4, "plan", "POST", f"{api}/cases/{case_id}/plan",
                 payload={"fields": {k: v for k, v in fields.items()
                                     if k not in ("missing", "direction", "sender_id")},
                          "sharedCredentials": args.shared_credentials})
    _field("path", plan.get("path"))
    _field("notSure", plan.get("notSure"))
    _field("steps", [s["id"] for s in plan.get("steps", [])])
    _print_clocks(plan.get("clocks", {}))

    # 5. reminders
    reminders = _step(5, "reminders", "POST", f"{api}/cases/{case_id}/reminders",
                      payload={"email": args.email, "demo": args.demo})
    _field("enrolled", reminders.get("enrolled"))
    _field("email", args.email)
    _print_step_table(reminders.get("steps", []), reminders.get("skipped", []))

    # Both halves of this link are secrets and this output gets screen-recorded,
    # so neither is printed: the case ID is the victim's only credential (read it
    # from .last_case) and the token only ever leaves the backend by email.
    saved = json.loads(LAST_CASE.read_text(encoding="utf-8"))
    print(f"unsubscribe (fill both placeholders; c= is in {LAST_CASE.name}):")
    print(f"      {saved['apiUrl']}/r/unsubscribe"
          "?c=<caseId from .last_case>&t=<token from the email>")
    if args.public_base_url:
        # Same reasoning as the unsubscribe link above (D100): the case ID is a
        # credential, so the placeholder is printed, never the value. The ID sits
        # in the fragment (D111) so it never reaches an access log either.
        print(f"case page: {args.public_base_url.rstrip('/')}/#case=<caseId from {LAST_CASE.name}>")
    print(f"PASS  all 5 steps ok  (caseRef {ref})")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--api-url", required=True,
                        help="HTTP API base URL, e.g. https://abc.execute-api.us-east-1.amazonaws.com")
    parser.add_argument("--image", default=str(DEFAULT_IMAGE),
                        help=f"screenshot to upload (default: {DEFAULT_IMAGE})")
    parser.add_argument("--email", required=True, help="where the reminder is sent")
    parser.add_argument("--demo", action="store_true",
                        help="compress the reminder cadence (needs AllowDemoMode=true)")
    parser.add_argument("--shared-credentials", choices=("no", "yes", "not_sure"), default="no",
                        help="triage answer: 'no'/'not_sure' -> unauthorised (5 steps), "
                             "'yes' -> authorised (4 steps). Default: no")
    parser.add_argument("--content-type", choices=sorted(ALLOWED_CONTENT_TYPES),
                        help="override the content type guessed from the file name")
    parser.add_argument("--public-base-url", default=os.environ.get("THAAM_PUBLIC_BASE_URL", ""),
                        help="site base URL, only used to print the case page link")
    args = parser.parse_args(argv)
    try:
        return run(args)
    except SmokeError as err:
        print(f"FAIL  {err}", file=sys.stderr)
        return 1
    except KeyError as err:
        print(f"FAIL  response missing {err}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
