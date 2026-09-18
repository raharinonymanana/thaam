// Reading the reminder cadence and the family share budget.
//
// The labels are the subject lines the backend actually sends (SUBJECTS in
// backend/src/reminder_email.py), minus the "Thaam: " prefix. They are not
// reworded here: what the list calls a step and what lands in the inbox have
// to be the same thing, or a victim cannot match one to the other.

const SUBJECTS = {
  bank_ack: "your bank deadline",
  liability_window: "liability window closing",
  shadow_credit: "provisional credit due",
  ombudsman: "you can escalate now",
  closeout: "final check-in",
  portal_status: "check your complaint status",
};

// The order the backend schedules them in, across both paths: an unauthorised
// case gets the liability steps, an authorised one gets portal_status instead.
export const STEP_ORDER = [
  "bank_ack", "portal_status", "liability_window", "shadow_credit", "ombudsman", "closeout",
];

export const SKIP_REASONS = {
  deadline_passed: "Skipped — this date has already passed",
  case_expiring: "Skipped — your case closes before this date",
};

export const SKIPPED_UNKNOWN = "Skipped";

export const FAMILY_MAX_SENDS = 3;

/** 'bank_ack' -> 'Your bank deadline'. Only the first letter changes: the
 * words stay exactly as the email's subject line has them. */
export function stepLabel(step) {
  const subject = SUBJECTS[step];
  if (!subject) return step;
  return subject[0].toUpperCase() + subject.slice(1);
}

/** What to show beside one step.
 *
 * D114: sentAt is the truth. A schedule can fire late, be replaced or be
 * cancelled, but a step with a sentAt is one the victim has an email about,
 * so that beats everything else the record says.
 */
export function stepStatus(entry, formatDate) {
  if (entry?.sentAt) return { tone: "sent", text: "Sent ✓" };
  if (entry?.status === "skipped") {
    return { tone: "skipped", text: SKIP_REASONS[entry.reason] ?? SKIPPED_UNKNOWN };
  }
  if (entry?.urgent) return { tone: "soon", text: "Soon" };
  return { tone: "due", text: entry?.fireAt ? formatDate(entry.fireAt) : "" };
}

function byStepOrder(a, b) {
  return STEP_ORDER.indexOf(a.step) - STEP_ORDER.indexOf(b.step);
}

/** The shape POST /reminders answers with, as the shape GET /cases/{id} uses,
 * so the list is rendered by one piece of code either way. */
export function fromEnrolment({ steps = [], skipped = [] }, demo = false) {
  const merged = [
    ...steps.map((entry) => ({ ...entry, status: "scheduled", sentAt: null })),
    ...skipped.map((entry) => ({ ...entry, status: "skipped", fireAt: null, sentAt: null })),
  ];
  return { status: "active", demo, steps: merged.sort(byStepOrder) };
}

/** The cadence as stored, ordered. GET does not return a skipped step's reason,
 * so one that was not enrolled in this session just says "Skipped". */
export function fromCase(reminders) {
  if (!reminders) return null;
  return { ...reminders, steps: [...(reminders.steps ?? [])].sort(byStepOrder) };
}

export function isEnrolled(reminders) {
  return reminders?.status === "active";
}

/** 'You can share this 2 more times' / the line for a case with none left. */
export function sharesLine(sendsRemaining) {
  const left = Number.isFinite(sendsRemaining) ? Math.max(0, sendsRemaining) : FAMILY_MAX_SENDS;
  if (left === 0) return `You've used all ${FAMILY_MAX_SENDS} shares for this case.`;
  return `You can share this ${left} more ${left === 1 ? "time" : "times"}`;
}

/** D112: compressed reminder timings are a demo affordance, not a feature.
 * They only appear when the page was opened with ?demo=1, so nobody reaches
 * them by accident - and the backend refuses them unless it is enabled too. */
export function isDemoMode(search) {
  try {
    return new URLSearchParams(search ?? "").get("demo") === "1";
  } catch {
    return false;
  }
}

// A local check only, to keep the button disabled until the address looks
// plausible. The server decides, and SES decides after that.
const EMAIL = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

export function looksLikeEmail(value) {
  const text = String(value ?? "").trim();
  return text.length > 0 && text.length <= 254 && EMAIL.test(text);
}
