// Everything the plan page works out that is not markup: relative days, the
// checklist's groups, the dates timeline, tick persistence. Pure and free of
// React so each piece is tested on its own.
//
// All dates are IST, whatever the phone is set to. These are Indian bank
// deadlines, and a date that shifts by a day for someone abroad is dangerous.
// format.js is untouched: what it exports the tests still rely on, so this
// file only adds to it.

import { FOOTER_DISCLAIMERS } from "./disclaimers";
import { deadlineRows, formatInr } from "./format";

const IST = "Asia/Kolkata";

const DAY_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit",
});
const SHORT_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST, weekday: "short", day: "numeric", month: "short",
});
// h23, not hour12:false: some ICU builds print midnight as "24:05" for the latter.
const TIME_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

const DAY_MS = 86400000;

/** An ISO instant, or a plain '2026-09-17' calendar date, as a Date - or null.
 * A plain date is pinned to midday IST so no timezone can move it a day. */
function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || !value) return null;
  const text = /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? `${value.trim()}T12:00:00+05:30` : value;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function partsOf(formatter, date) {
  return Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]));
}

/** The IST calendar day of an instant, as a whole number of days. */
function istDay(date) {
  const { year, month, day } = partsOf(DAY_PARTS, date);
  return Date.UTC(Number(year), Number(month) - 1, Number(day)) / DAY_MS;
}

/** How far away a date is, in IST calendar days, and how loudly to say so.
 *
 * Calendar days, not 24-hour blocks: a deadline at 23:59 tonight is "Today"
 * even at 09:00, and one at 00:10 tomorrow is "Tomorrow" even at 23:50.
 * Returns null for something that is not a date.
 */
export function relativeDay(iso, now = new Date()) {
  const date = toDate(iso);
  const current = toDate(now);
  if (!date || !current) return null;
  const days = istDay(date) - istDay(current);
  let text;
  if (days < 0) text = "Date passed";
  else if (days === 0) text = "Today";
  else if (days === 1) text = "Tomorrow";
  else text = `In ${days} days`;
  const tone = days <= 0 ? "urgent" : days <= 3 ? "soon" : "later";
  return { days, text, tone };
}

/** '2026-09-22T23:59:59+05:30' -> 'Tue 22 Sep'. No year: every date on the
 * plan page is within 90 days. Built from parts because ICU spells the short
 * month 'Sept'. */
export function shortIstDate(iso) {
  const date = toDate(iso);
  if (!date) return "";
  const { weekday, day, month } = partsOf(SHORT_PARTS, date);
  return `${weekday} ${day} ${month.slice(0, 3)}`;
}

/** '2026-09-19T08:35:00Z' -> '14:05'. For the demo reminders, which fire
 * within minutes: a date would say nothing there. */
export function formatIstTime(iso) {
  const date = toDate(iso);
  if (!date) return "";
  const { hour, minute } = partsOf(TIME_PARTS, date);
  return `${hour}:${minute}`;
}

/** 'Today 14:05', or 'Thu 17 Sep 14:05' when it is not today. */
export function formatDemoFire(iso, now = new Date()) {
  const rel = relativeDay(iso, now);
  const time = formatIstTime(iso);
  if (!rel || !time) return "";
  return rel.days === 0 ? `Today ${time}` : `${shortIstDate(iso)} ${time}`;
}

// ---------------------------------------------------------------- summary

/** The pills under the title: what was lost, when, and which payment.
 * A pill whose value is missing is left out rather than shown empty. */
export function summaryPills(fields) {
  const pills = [];
  const amount = formatInr(fields?.amount);
  if (amount) pills.push({ id: "amount", text: `₹ ${amount}` });
  const date = shortIstDate(fields?.txn_date);
  if (date) pills.push({ id: "date", text: date });
  const utr = typeof fields?.utr === "string" ? fields.utr.trim() : "";
  if (utr.length >= 4) pills.push({ id: "utr", text: `UTR …${utr.slice(-4)}` });
  return pills;
}

// -------------------------------------------------------------- checklist

const GROUPS = [
  { id: "now", title: "Now", ids: ["call_1930", "block_payments"] },
  { id: "today", title: "Today", ids: ["file_ncrp", "keep_ack"] },
  { id: "week", title: "This week", ids: ["bank_letter", "fir", "chakshu"] },
];

/** The steps in three groups by how soon they matter. Order inside a group is
 * the backend's. A step this build has never heard of goes under "This week"
 * rather than being dropped: a step the server sent is a step to show. */
export function groupSteps(steps) {
  const groups = GROUPS.map(({ id, title }) => ({ id, title, items: [] }));
  const week = groups[2];
  for (const step of steps ?? []) {
    const home = groups.find((group, i) => GROUPS[i].ids.includes(step?.id)) ?? week;
    home.items.push(step);
  }
  return groups.filter((group) => group.items.length > 0);
}

/** The one step that carries its own deadline. The written complaint has to
 * reach the bank inside the zero-liability window; nothing else is dated. */
export function stepDeadline(step, clocks) {
  if (step?.id !== "bank_letter") return null;
  const iso = clocks?.bankReport?.deadline;
  return typeof iso === "string" && iso ? iso : null;
}

/** How many of the steps are ticked. Ticks for a step that is not in this plan
 * (an old id, or another path) are ignored, so the count can never pass 100%. */
export function progressOf(steps, ticks) {
  const ids = new Set((steps ?? []).map((step) => step.id));
  const done = new Set((ticks ?? []).filter((id) => ids.has(id))).size;
  return { done, total: ids.size };
}

// --------------------------------------------------------------- timeline

// What each date means to the person reading it. Only the first is theirs to
// act on; the rest are the bank's or the RBI's clocks, said as facts.
const TIMELINE = {
  limitedLiability: { note: "estimated — act before this date", userDeadline: true },
  shadowCredit: { note: "estimated — the bank should do this by then", userDeadline: false },
  ombudsman: { note: "estimated — you can do this from this date", userDeadline: false },
  resolution: { note: "estimated — the bank's deadline", userDeadline: false },
};

/** The rows of "Dates to know", from the clocks the plan actually carries.
 * The bank deadline is not here - it lives on its checklist item - and the
 * labels are the ones format.js already uses, not a second copy. */
export function timelineRows(clocks) {
  return deadlineRows(clocks)
    .filter((row) => TIMELINE[row.id])
    .map((row) => ({ ...row, ...TIMELINE[row.id] }));
}

// ---------------------------------------------------------------- script

/** Splits a call script into plain text and [placeholders] the victim has to
 * fill in or say aloud, so the placeholders can be marked. The brackets stay
 * in the text: they are part of what is read out. Works for Hindi as well. */
export function splitPlaceholders(text) {
  if (typeof text !== "string" || !text) return [];
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(/\[[^\]]+\]/g)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index), placeholder: false });
    parts.push({ text: match[0], placeholder: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), placeholder: false });
  return parts;
}

// ------------------------------------------------------------ golden hour

/** The moment the first hour ends, from "minutes left" at the moment the plan
 * arrived. Computed once, on first render: after that the clock is the phone's,
 * not another round trip. */
export function goldenHourEnd(goldenHour, nowMs) {
  const minutes = Math.max(0, Number(goldenHour?.minutesLeft) || 0);
  return nowMs + minutes * 60000;
}

/** Whole minutes left, rounded down, never negative. Down rather than up: the
 * line must never promise time that has gone. */
export function minutesLeftAt(endMs, nowMs) {
  return Math.max(0, Math.floor((endMs - nowMs) / 60000));
}

/** The golden hour as it stands at nowMs, in the shape goldenHourLine reads.
 * At zero it becomes the expired message, whatever the plan first said. */
export function goldenHourAt(goldenHour, endMs, nowMs) {
  if (!goldenHour) return null;
  if (goldenHour.expired) return goldenHour;
  const minutesLeft = minutesLeftAt(endMs, nowMs);
  if (minutesLeft === 0) return { ...goldenHour, minutesLeft: 0, expired: true };
  return { ...goldenHour, minutesLeft };
}

// ------------------------------------------------------------ disclaimers

/** The plan's disclaimer lines that the footer does not already show.
 *
 * The footer carries the same three lines on every screen, so repeating them
 * at the end of the plan page says nothing new. Only an exact match is dropped:
 * a line that differs by so much as a full stop is a different sentence, and it
 * stays. No legal text can go missing this way - every dropped line is on
 * screen one row lower, in the footer. */
export function extraDisclaimers(lines, footer = FOOTER_DISCLAIMERS) {
  if (!Array.isArray(lines)) return [];
  return lines.filter((line) => typeof line === "string" && line !== "" && !footer.includes(line));
}

// ------------------------------------------------------------------ ticks
//
// Which steps the victim has ticked is kept on this phone and nowhere else -
// never sent to the server. Every access is in a try/catch: storage is
// missing in some private windows, throws when it is full or blocked, and is
// simply absent under test. Failing to remember a tick must never break the page.
//
// D136: the storage key is derived from the case ID, never made of it. The case
// ID is the only credential a case has - state.js keeps it out of storage for
// that reason - so the key is a one-way fingerprint: the first 16 hex characters
// of its SHA-256. Hashing needs crypto.subtle, which browsers only provide in a
// secure context (https, or localhost). Anywhere else there is no key at all
// (null), and ticks live in memory for the visit; the raw ID is never a
// fallback. The key is computed once, asynchronously, and the storage functions
// take it - so they stay synchronous and a null key makes every one a no-op.

const TICKS_PREFIX = "thaam:ticks:";

const NO_STORAGE = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

function defaultStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    // Reading the property itself can throw when storage is blocked.
  }
  return NO_STORAGE;
}

function defaultSubtle() {
  try {
    return globalThis.crypto?.subtle ?? null;
  } catch {
    return null;
  }
}

/** 'thaam:ticks:' + the first 16 hex characters of SHA-256(caseId), or null
 * when there is no case ID or no way to hash it. Same ID, same key; the key
 * says nothing about the ID it came from. */
export async function ticksKey(caseId, subtle = defaultSubtle()) {
  if (typeof caseId !== "string" || !caseId || !subtle) return null;
  try {
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(caseId));
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${TICKS_PREFIX}${hex.slice(0, 16)}`;
  } catch {
    return null;
  }
}

export function loadTicks(key, storage = defaultStorage()) {
  if (!key) return [];
  try {
    const raw = storage.getItem(key);
    if (raw == null) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** An empty list removes the key instead of storing "[]": nothing is left
 * behind for a case with nothing ticked. */
export function saveTicks(key, ids, storage = defaultStorage()) {
  if (!key) return;
  try {
    if (!ids?.length) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(ids));
  } catch {
    // Not remembered; the tick still shows for this visit.
  }
}

export function clearTicks(key, storage = defaultStorage()) {
  if (!key) return;
  try {
    storage.removeItem(key);
  } catch {
    // Nothing to clear if storage cannot be reached.
  }
}
