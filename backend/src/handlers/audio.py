"""GET /cases/{caseId}/audio?lang=hi|en - the call script as speech (Polly)."""
from __future__ import annotations

import hashlib

from botocore.exceptions import ClientError

from handlers import common
from plan_builder import build_script_ssml

LANGUAGE_CODES = {"hi": "hi-IN", "en": "en-IN"}
VOICE_ID = "Kajal"
URL_EXPIRES_SECONDS = 600

# Same reasoning as extract (D74): no s3:ListBucket, so a missing key answers
# 403 instead of 404. Either one means "not generated yet".
MISSING_OBJECT_CODES = {"404", "NoSuchKey", "403"}

UNAVAILABLE = {
    "error": "audio_unavailable",
    "message": "Audio is unavailable right now. Please read the script on screen.",
}


def audio_key(case_id: str, lang: str, ssml: str) -> str:
    # The hash changes when the confirmed fields or path change, so a re-plan
    # never serves stale audio. Old files expire with the packs/ lifecycle.
    digest = hashlib.sha256(ssml.encode("utf-8")).hexdigest()[:16]
    return f"packs/{case_id}/script-{lang}-{digest}.mp3"


def _exists(key: str) -> bool:
    try:
        common.s3().head_object(Bucket=common.BUCKET_NAME, Key=key)
        return True
    except ClientError as err:
        if err.response.get("Error", {}).get("Code") in MISSING_OBJECT_CODES:
            return False
        raise


def lambda_handler(event, context):
    case_id = (event.get("pathParameters") or {}).get("caseId")
    if not common.is_valid_case_id(case_id):
        return common.json_response(400, {
            "error": "invalid_case_id", "message": "Case ID is not valid.",
        })
    # Only a well-formed ID reaches this point; invalid ones are never logged.
    ref = common.case_ref(case_id)

    lang = (event.get("queryStringParameters") or {}).get("lang")
    if lang not in LANGUAGE_CODES:
        common.log_event("audio", caseRef=ref, status="invalid_lang")
        return common.json_response(400, {
            "error": "invalid_lang", "message": "lang must be hi or en.",
        })

    item = common.cases_table().get_item(Key={"caseId": case_id}).get("Item")
    if not item:
        common.log_event("audio", caseRef=ref, lang=lang, status="not_found")
        return common.json_response(404, {"error": "not_found", "message": "Case not found."})
    if item.get("status") != "planned":
        common.log_event("audio", caseRef=ref, lang=lang, status="wrong_status")
        return common.json_response(409, {
            "error": "wrong_status", "message": "Build the plan before requesting audio.",
        })

    ssml = build_script_ssml(item["confirmedFields"], item["path"], lang)
    key = audio_key(case_id, lang, ssml)
    cached = _exists(key)

    if not cached:
        try:
            speech = common.polly().synthesize_speech(
                Engine="neural",
                VoiceId=VOICE_ID,
                LanguageCode=LANGUAGE_CODES[lang],
                OutputFormat="mp3",
                TextType="ssml",
                Text=ssml,
            )
        except ClientError as err:
            common.log_event("audio", caseRef=ref, lang=lang, status="polly_error",
                             pollyCode=err.response.get("Error", {}).get("Code"),
                             ssmlChars=len(ssml))
            return common.json_response(502, UNAVAILABLE)
        common.s3().put_object(
            Bucket=common.BUCKET_NAME,
            Key=key,
            Body=speech["AudioStream"].read(),
            ContentType="audio/mpeg",
        )

    url = common.s3().generate_presigned_url(
        "get_object",
        Params={"Bucket": common.BUCKET_NAME, "Key": key},
        ExpiresIn=URL_EXPIRES_SECONDS,
    )
    common.log_event("audio", caseRef=ref, lang=lang, status="ok", cached=cached,
                     ssmlChars=len(ssml))
    return common.json_response(200, {
        "lang": lang,
        "url": url,
        "expiresInSeconds": URL_EXPIRES_SECONDS,
        "cached": cached,
    })
