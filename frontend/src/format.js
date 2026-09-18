// Turning the plan response into things a person can read.

const IST_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** '2026-09-19T23:59:59+05:30' -> 'Sat, 19 Sep 2026'.
 *
 * Always IST, whatever the phone is set to: these are Indian bank deadlines,
 * and a date that shifts by a day for someone abroad would be dangerous.
 * Assembled from parts because ICU spells the short month 'Sept', not 'Sep'.
 */
export function formatIstDate(iso) {
  if (typeof iso !== "string" || !iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    IST_DATE.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${parts.weekday}, ${parts.day} ${parts.month.slice(0, 3)} ${parts.year}`;
}

export const ESTIMATED_NOTE = "estimated — act before this date";

// In the order a victim meets them. Each row names the clock, the key inside
// it holding the date, and the sentence that says why the date matters.
const CLOCK_ROWS = [
  ["bankReport", "deadline", "Tell your bank in writing — for zero liability"],
  ["limitedLiability", "until", "Limited-liability window ends"],
  ["shadowCredit", "by", "Bank should credit the amount back (shadow credit)"],
  ["ombudsman", "eligibleFrom", "You can complain to the RBI Ombudsman from"],
  ["resolution", "by", "Bank must resolve your complaint by"],
];

/** One row per clock the plan actually carries.
 *
 * The authorised path has no bankReport and no limitedLiability, because no
 * liability cap exists there. A row is only ever built from a clock that is
 * present: inventing one would promise a protection the victim does not have.
 */
export function deadlineRows(clocks) {
  const rows = [];
  for (const [name, key, label] of CLOCK_ROWS) {
    const clock = clocks?.[name];
    const iso = clock?.[key];
    if (typeof iso !== "string" || !iso) continue;
    rows.push({
      id: name,
      label,
      iso,
      date: formatIstDate(iso),
      url: typeof clock.url === "string" ? clock.url : null,
    });
  }
  return rows;
}

/** The first-hour line: minutes remaining, or the message the backend wrote
 * for a golden hour that has already gone. */
export function goldenHourLine(goldenHour) {
  if (!goldenHour) return null;
  if (goldenHour.expired) {
    return goldenHour.message ?? "Call 1930 anyway — money can still sometimes be frozen.";
  }
  const minutes = Math.max(0, Number(goldenHour.minutesLeft) || 0);
  return `About ${minutes} ${minutes === 1 ? "minute" : "minutes"} left in the first hour`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

/** '2026-09-17' -> '17 September 2026'.
 *
 * Built from the parts, not from a Date: these strings are already plain
 * calendar dates with no timezone, and parsing one into a Date would shift it
 * by a day for anyone west of IST. Written out in full because it goes into a
 * complaint and a letter to a bank, where 09/17 and 17/09 are both readable
 * and mean different things.
 */
export function formatLongDate(value) {
  if (typeof value !== "string") return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return "";
  const [, year, month, day] = match;
  const name = MONTHS[Number(month) - 1];
  if (!name) return "";
  return `${Number(day)} ${name} ${year}`;
}

/** '1234567.5' -> '12,34,567.50'. Indian digit grouping: the last three
 * digits, then pairs. An Indian reader checking an amount against their
 * statement should not have to re-read it in thousands. */
export function formatInr(amount) {
  // Strict on purpose. Number("") and Number(null) are both 0, so a looser
  // check would turn a missing amount into "₹0.00" - a wrong figure in a
  // police complaint and a letter to a bank, which is worse than no line.
  if (typeof amount !== "string" && typeof amount !== "number") return "";
  const text = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return "";
  const number = Number(text);
  if (!Number.isFinite(number)) return "";
  const [rupees, paise] = number.toFixed(2).split(".");
  let head = rupees.slice(0, -3);
  const tail = rupees.slice(-3);
  if (!head) return `${tail}.${paise}`;
  const groups = [];
  while (head.length > 2) {
    groups.unshift(head.slice(-2));
    head = head.slice(0, -2);
  }
  if (head) groups.unshift(head);
  return `${groups.join(",")},${tail}.${paise}`;
}
