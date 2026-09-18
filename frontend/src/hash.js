// The returning victim's link is #case=<caseId> (D111).
//
// The case ID sits in the FRAGMENT because a fragment is never sent to a
// server: it stays out of the Amplify access log, out of any CDN log and out
// of the Referer header this page would otherwise leak it in. It is the only
// credential the case has, so where it travels matters.

// Exactly what the backend accepts: secrets.token_urlsafe(16) is 22 characters
// of the URL-safe base64 alphabet. Anything else is not worth a request.
const CASE_HASH = /^#case=([A-Za-z0-9_-]{22})$/;

/** The case ID in a location hash, or null if there isn't a valid one. */
export function parseCaseHash(hash) {
  if (typeof hash !== "string") return null;
  return CASE_HASH.exec(hash)?.[1] ?? null;
}

/** Put the case in the address bar once there is a plan to come back to.
 *
 * replaceState, not a new history entry: Back should leave the app, not walk
 * the victim backwards through a flow whose earlier screens no longer apply.
 * It also fires no hashchange, so this cannot restart the app it just set up.
 */
export function setCaseHash(caseId) {
  const { pathname, search } = window.location;
  window.history.replaceState(null, "", `${pathname}${search}#case=${caseId}`);
}

/** Drop the fragment without reloading, so a "start again" cannot walk back
 * into a case that has expired - and so the ID leaves the address bar. */
export function clearCaseHash() {
  const { pathname, search } = window.location;
  window.history.replaceState(null, "", `${pathname}${search}`);
}
