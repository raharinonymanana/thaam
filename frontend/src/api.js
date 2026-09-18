// The one place the app talks to the network.
//
// Every failure a screen has to show arrives as an ApiError with a message that
// is already safe to render: the server's own wording when it sent JSON, and a
// plain-language fallback otherwise. Screens never build error text themselves.
import { API_URL } from "./config";

export const NETWORK_MESSAGE =
  "We could not reach Thaam. Check your internet connection and try again.";
export const SERVER_MESSAGE = "Something went wrong at our end. Please try again.";
export const UNEXPECTED_MESSAGE = "Something went wrong. Please try again.";

export class ApiError extends Error {
  constructor({ status = 0, code = "unknown", message = UNEXPECTED_MESSAGE, field = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

/** Build an ApiError from a response status and its decoded body (or null).
 *
 * Pure, so the mapping can be tested without a network. The backend answers
 * {error, message[, field]} on every 4xx it raises; anything else (a 5xx from
 * API Gateway, an HTML error page, a truncated body) has no message we would
 * want to show a victim, so a fallback is used.
 */
export function apiErrorFrom(status, payload) {
  const body = payload && typeof payload === "object" ? payload : null;
  const message = typeof body?.message === "string" && body.message.trim()
    ? body.message.trim()
    : status >= 500 ? SERVER_MESSAGE : UNEXPECTED_MESSAGE;
  return new ApiError({
    status,
    code: typeof body?.error === "string" && body.error ? body.error : `http_${status}`,
    message,
    field: typeof body?.field === "string" ? body.field : null,
  });
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function request(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // A DNS failure, an offline phone and a blocked origin all land here, and
    // the browser deliberately tells us nothing more.
    throw new ApiError({ status: 0, code: "network", message: NETWORK_MESSAGE });
  }
  const payload = await readJson(res);
  if (!res.ok) throw apiErrorFrom(res.status, payload);
  return payload;
}

/** Open a case. Consent is sent here and nowhere else: this is the first moment
 * anything of the victim's is stored, and the presigned form we get back is only
 * valid for five minutes, so the screen calls this immediately before uploading. */
export function createCase({ consent, contentType = "image/jpeg" }) {
  return request("/cases", { method: "POST", body: { consent, contentType } });
}

export function extract(caseId) {
  return request(`/cases/${caseId}/extract`, { method: "POST" });
}

export function getCase(caseId) {
  return request(`/cases/${caseId}`);
}

export function buildPlan(caseId, { fields, sharedCredentials }) {
  return request(`/cases/${caseId}/plan`, {
    method: "POST",
    body: { fields, sharedCredentials },
  });
}

/** A presigned URL for the spoken script. It expires in ten minutes, so it is
 * fetched when the victim presses Listen and never held in state beyond that. */
export function getAudio(caseId, lang) {
  return request(`/cases/${caseId}/audio?lang=${encodeURIComponent(lang)}`);
}

/** Enrol this case for the 90-day reminder cadence. Re-enrolling replaces the
 * schedules that were there, so this is safe to call again. */
export function enrolReminders(caseId, { email, demo = false }) {
  return request(`/cases/${caseId}/reminders`, { method: "POST", body: { email, demo } });
}

/** One email to one person, at most three per case. The helper gets the steps
 * and the dates - never the case link, and never the money. */
export function shareWithFamily(caseId, { email, toName }) {
  const body = { email };
  if (toName) body.toName = toName;
  return request(`/cases/${caseId}/family`, { method: "POST", body });
}

// S3 answers a presigned POST with XML, not JSON.
const S3_MESSAGES = {
  EntityTooLarge: "That image is too large. Please try a smaller screenshot.",
  ExpiredToken: "The upload link expired. Please try again.",
  AccessDenied: "The upload link expired. Please try again.",
  RequestTimeout: "The upload timed out. Please try again.",
};

function s3Code(xml) {
  return /<Code>([^<]+)<\/Code>/.exec(xml || "")?.[1] ?? "";
}

/** Upload the prepared image straight to S3 with the presigned form.
 *
 * The order matters: every field of the policy goes in first and the file LAST,
 * because S3 stops reading the multipart body at the file part. The browser sets
 * the multipart Content-Type itself, so we must not set any header here.
 */
export async function uploadToS3(upload, blob) {
  const form = new FormData();
  for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
  form.append("file", blob);

  let res;
  try {
    res = await fetch(upload.url, { method: "POST", body: form });
  } catch {
    throw new ApiError({ status: 0, code: "network", message: NETWORK_MESSAGE });
  }
  if (!res.ok) {
    const code = s3Code(await res.text().catch(() => ""));
    throw new ApiError({
      status: res.status,
      code: code || `http_${res.status}`,
      message: S3_MESSAGES[code] ?? "We could not upload your screenshot. Please try again.",
    });
  }
}
