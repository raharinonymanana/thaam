"""DELETE /cases/{caseId} - "Delete my case now" (D120).

Thaam promises the screenshot goes in 7 days and the case in 90. This is the
victim not waiting: one request, everything of theirs gone.

ORDER MATTERS. Schedules, then S3 objects, then the DynamoDB item - because
the item is the only record of what else exists. Deleting it first would
orphan the schedules (which would then fire at a case that is not there) and
orphan the audio files (whose keys are derived from the item's fields and
could never be recomputed). Anything failing before the item is deleted leaves
the item in place and answers 502, so the victim can press the button again
and the retry finishes the job. Every step is idempotent, so a retry is safe.

An expired-but-not-yet-reaped case is deleted normally here rather than
answering 404 like GET does: the whole point is to remove it early, and
refusing would leave data behind that the victim has asked us to destroy.
"""
from __future__ import annotations

from handlers import common
from handlers.audio import LANGUAGE_CODES, audio_key
from handlers.enroll import delete_schedules
from plan_builder import build_script_ssml

# A GET of this case must not be served from a cache after it is gone, and the
# response itself is about personal data.
NO_STORE = {"Cache-Control": "no-store"}

INCOMPLETE = {
    "error": "delete_incomplete",
    "message": "We could not finish deleting your case. Please try again.",
}


def _response(status: int, body) -> dict:
    return common.json_response(status, body, headers=NO_STORE)


def _schedule_names(item: dict) -> list[str]:
    reminders = item.get("reminders") or {}
    return [s.get("scheduleName") for s in reminders.get("steps") or []
            if s.get("scheduleName")]


def object_keys(case_id: str, item: dict) -> list[str]:
    """Every S3 key this case owns that we can still name.

    HONEST LIMIT: the audio key contains a hash of the SSML, which is built
    from the confirmed fields and the path. Re-planning a case changes those,
    so an audio file generated BEFORE a re-plan has a digest we can no longer
    compute, and without s3:ListBucket (D74) we cannot discover it either. It
    is not deleted here; it expires with the packs/ 90-day lifecycle rule. The
    current plan's audio - the only file the victim has actually been offered
    since - does get deleted.
    """
    keys = [common.upload_key(case_id)]

    fields, path = item.get("confirmedFields"), item.get("path")
    if not fields or not path:
        return keys
    for lang in LANGUAGE_CODES:
        try:
            keys.append(audio_key(case_id, lang, build_script_ssml(fields, path, lang)))
        except (ValueError, KeyError, TypeError):
            # A record we cannot build a script from has no audio we can name.
            # Skipped rather than failed: a case must never become undeletable
            # because one of its own stored values is malformed, and no retry
            # would fix it anyway.
            common.log_event("delete_case", caseRef=common.case_ref(case_id),
                             status="audio_key_skipped", lang=lang)
    return keys


def lambda_handler(event, context):
    case_id = (event.get("pathParameters") or {}).get("caseId")
    if not common.is_valid_case_id(case_id):
        return _response(400, {
            "error": "invalid_case_id", "message": "Case ID is not valid.",
        })
    # Only a well-formed ID reaches this point; invalid ones are never logged.
    ref = common.case_ref(case_id)

    item = common.cases_table().get_item(Key={"caseId": case_id}).get("Item")
    if not item:
        common.log_event("delete_case", caseRef=ref, status="not_found")
        return _response(404, {"error": "not_found", "message": "Case not found."})

    names = _schedule_names(item)
    keys = object_keys(case_id, item)
    try:
        # SCHEDULE_GROUP comes from this function's own environment; the
        # deletion logic is enroll's, imported rather than copied so the two
        # cannot drift on how a already-fired schedule is tolerated.
        cancelled = delete_schedules(names)
        for key in keys:
            # No head_object first: delete_object on a missing key succeeds, so
            # a case whose screenshot has already expired deletes cleanly.
            common.s3().delete_object(Bucket=common.BUCKET_NAME, Key=key)
    except Exception as err:  # noqa: BLE001 - the item stays, the victim retries
        common.log_event("delete_case", caseRef=ref, status="incomplete",
                         scheduleCount=len(names), keyCount=len(keys),
                         errorType=type(err).__name__)
        return _response(502, INCOMPLETE)

    # Last: after this there is nothing left to tell us what else existed.
    common.cases_table().delete_item(Key={"caseId": case_id})

    common.log_event("delete_case", caseRef=ref, status="deleted",
                     remindersCancelled=cancelled, keyCount=len(keys))
    return _response(200, {"deleted": True, "remindersCancelled": cancelled})
