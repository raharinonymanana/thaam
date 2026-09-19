import { describe, expect, it } from "vitest";
import { FOOTER_DISCLAIMERS } from "../disclaimers";
import { deadlineRows, goldenHourLine } from "../format";
import {
  clearTicks, extraDisclaimers, formatDemoFire, formatIstTime, goldenHourAt, goldenHourEnd,
  groupSteps, loadTicks, minutesLeftAt, progressOf, relativeDay, saveTicks,
  shortIstDate, splitPlaceholders, stepDeadline, summaryPills, ticksKey, timelineRows,
} from "../planview";

// 2026-09-19 (a Saturday) 14:00 IST.
const NOW = new Date("2026-09-19T14:00:00+05:30");

describe("relativeDay", () => {
  it.each([
    ["2026-09-18T23:59:59+05:30", -1, "Date passed", "urgent"],
    ["2026-09-19T09:00:00+05:30", 0, "Today", "urgent"],
    ["2026-09-19T23:59:59+05:30", 0, "Today", "urgent"],
    ["2026-09-20T00:10:00+05:30", 1, "Tomorrow", "soon"],
    ["2026-09-21T23:59:59+05:30", 2, "In 2 days", "soon"],
    ["2026-09-22T23:59:59+05:30", 3, "In 3 days", "soon"],
    ["2026-09-23T00:00:00+05:30", 4, "In 4 days", "later"],
    ["2026-12-18T23:59:59+05:30", 90, "In 90 days", "later"],
  ])("%s is %i days away", (iso, days, text, tone) => {
    expect(relativeDay(iso, NOW)).toEqual({ days, text, tone });
  });

  it("counts IST calendar days, not 24-hour blocks", () => {
    // 23:50 IST tonight and 00:10 IST tomorrow are 20 minutes apart, one day apart.
    const late = new Date("2026-09-19T23:50:00+05:30");
    expect(relativeDay("2026-09-20T00:10:00+05:30", late).days).toBe(1);
    // And 00:10 IST is still the same day as 23:59 IST that evening.
    const early = new Date("2026-09-19T00:10:00+05:30");
    expect(relativeDay("2026-09-19T23:59:59+05:30", early).days).toBe(0);
  });

  it("is IST whatever the instant's own offset says", () => {
    // 20:00Z on the 19th is 01:30 IST on the 20th, so "now" is already the 20th.
    const now = new Date("2026-09-19T20:00:00Z");
    expect(relativeDay("2026-09-20T23:59:59+05:30", now).days).toBe(0);
    expect(relativeDay("2026-09-19T23:59:59+05:30", now).days).toBe(-1);
  });

  it("reads a plain calendar date as that IST day", () => {
    expect(relativeDay("2026-09-19", NOW).days).toBe(0);
    expect(relativeDay("2026-09-22", NOW).days).toBe(3);
  });

  it("defaults now to the real clock", () => {
    const soon = new Date(Date.now() + 5 * 86400000).toISOString();
    expect(relativeDay(soon).days).toBeGreaterThanOrEqual(4);
  });

  it.each([null, undefined, "", "not a date", 42, {}])("returns null for %j", (bad) => {
    expect(relativeDay(bad, NOW)).toBeNull();
  });
});

describe("shortIstDate", () => {
  it.each([
    ["2026-09-22T23:59:59+05:30", "Tue 22 Sep"],
    ["2026-09-19T00:00:00+05:30", "Sat 19 Sep"],
    ["2026-12-31T23:59:59+05:30", "Thu 31 Dec"],
    ["2026-03-05T12:00:00+05:30", "Thu 5 Mar"],
  ])("%s -> %s", (iso, expected) => {
    expect(shortIstDate(iso)).toBe(expected);
  });

  it("always says 'Sep', never ICU's 'Sept'", () => {
    expect(shortIstDate("2026-09-01T10:00:00+05:30")).toBe("Tue 1 Sep");
  });

  it("uses the IST day, not the UTC one", () => {
    // 20:00Z is 01:30 the next morning in India.
    expect(shortIstDate("2026-09-22T20:00:00Z")).toBe("Wed 23 Sep");
  });

  it("reads a plain calendar date as that day", () => {
    expect(shortIstDate("2026-09-17")).toBe("Thu 17 Sep");
  });

  it.each([null, undefined, "", "nope", 7])("returns '' for %j", (bad) => {
    expect(shortIstDate(bad)).toBe("");
  });
});

describe("formatIstTime", () => {
  it("is the IST clock time, 24-hour", () => {
    expect(formatIstTime("2026-09-19T08:35:00Z")).toBe("14:05");
    expect(formatIstTime("2026-09-19T14:05:00+05:30")).toBe("14:05");
  });

  it("writes midnight as 00:xx, never 24:xx", () => {
    expect(formatIstTime("2026-09-19T18:30:00Z")).toBe("00:00");
    expect(formatIstTime("2026-09-19T18:35:00Z")).toBe("00:05");
  });

  it("zero-pads", () => {
    expect(formatIstTime("2026-09-19T03:34:00Z")).toBe("09:04");
  });

  it("returns '' for a non-date", () => {
    expect(formatIstTime("nope")).toBe("");
    expect(formatIstTime(null)).toBe("");
  });
});

describe("formatDemoFire", () => {
  it("says Today for a reminder due today", () => {
    expect(formatDemoFire("2026-09-19T14:05:00+05:30", NOW)).toBe("Today 14:05");
  });

  it("says the date for one that is not", () => {
    expect(formatDemoFire("2026-09-22T09:30:00+05:30", NOW)).toBe("Tue 22 Sep 09:30");
  });

  it("is empty for a non-date", () => {
    expect(formatDemoFire(null, NOW)).toBe("");
  });
});

describe("summaryPills", () => {
  it("shows amount, date and the last four of the UTR", () => {
    expect(summaryPills({ amount: "1234567.5", txn_date: "2026-09-17", utr: "426173859012" }))
      .toEqual([
        { id: "amount", text: "₹ 12,34,567.50" },
        { id: "date", text: "Thu 17 Sep" },
        { id: "utr", text: "UTR …9012" },
      ]);
  });

  it("leaves out any pill whose value is missing", () => {
    expect(summaryPills({ amount: "250", txn_date: "2026-09-17", utr: null }).map((p) => p.id))
      .toEqual(["amount", "date"]);
    expect(summaryPills({ amount: "", txn_date: null, utr: "426173859012" }).map((p) => p.id))
      .toEqual(["utr"]);
    expect(summaryPills({})).toEqual([]);
    expect(summaryPills(null)).toEqual([]);
  });

  it("never shows a made-up amount", () => {
    // formatInr refuses "" and null, so no "₹ 0.00" can reach a screen.
    expect(summaryPills({ amount: "" })).toEqual([]);
    expect(summaryPills({ amount: null })).toEqual([]);
  });

  it("does not show a UTR too short to have a last four", () => {
    expect(summaryPills({ utr: "123" })).toEqual([]);
  });
});

const STEP = (id) => ({ id, title: id, detail: `${id} detail` });

describe("groupSteps", () => {
  const unauthorised = ["call_1930", "file_ncrp", "keep_ack", "block_payments", "bank_letter"]
    .map(STEP);
  const authorised = ["call_1930", "file_ncrp", "keep_ack", "block_payments", "fir", "chakshu"]
    .map(STEP);
  const ids = (group) => group.items.map((step) => step.id);

  it("puts the unauthorised plan in Now / Today / This week", () => {
    const groups = groupSteps(unauthorised);
    expect(groups.map((g) => [g.id, g.title])).toEqual([
      ["now", "Now"], ["today", "Today"], ["week", "This week"],
    ]);
    expect(ids(groups[0])).toEqual(["call_1930", "block_payments"]);
    expect(ids(groups[1])).toEqual(["file_ncrp", "keep_ack"]);
    expect(ids(groups[2])).toEqual(["bank_letter"]);
  });

  it("puts the authorised plan's FIR and Chakshu in This week, in order", () => {
    const groups = groupSteps(authorised);
    expect(ids(groups[2])).toEqual(["fir", "chakshu"]);
  });

  it("keeps the backend's order inside a group", () => {
    const reversed = ["block_payments", "call_1930"].map(STEP);
    expect(ids(groupSteps(reversed)[0])).toEqual(["block_payments", "call_1930"]);
  });

  it("puts a step it has never heard of under This week rather than dropping it", () => {
    const groups = groupSteps([...unauthorised, STEP("something_new")]);
    expect(ids(groups[2])).toEqual(["bank_letter", "something_new"]);
    const every = groups.flatMap(ids);
    expect(every).toHaveLength(unauthorised.length + 1);
  });

  it("omits groups with nothing in them", () => {
    expect(groupSteps([STEP("fir")]).map((g) => g.id)).toEqual(["week"]);
    expect(groupSteps([STEP("keep_ack")]).map((g) => g.id)).toEqual(["today"]);
  });

  it("copes with nothing at all", () => {
    expect(groupSteps([])).toEqual([]);
    expect(groupSteps(undefined)).toEqual([]);
  });

  it("returns the step objects themselves", () => {
    const step = STEP("call_1930");
    expect(groupSteps([step])[0].items[0]).toBe(step);
  });
});

describe("stepDeadline", () => {
  const clocks = { bankReport: { deadline: "2026-09-22T23:59:59+05:30" } };

  it("is the bank report deadline for the bank letter", () => {
    expect(stepDeadline({ id: "bank_letter" }, clocks)).toBe("2026-09-22T23:59:59+05:30");
  });

  it("is null for every other step", () => {
    for (const id of ["call_1930", "file_ncrp", "keep_ack", "block_payments", "fir", "chakshu", "x"]) {
      expect(stepDeadline({ id }, clocks), id).toBeNull();
    }
  });

  it("is null when the plan has no bank report clock", () => {
    expect(stepDeadline({ id: "bank_letter" }, {})).toBeNull();
    expect(stepDeadline({ id: "bank_letter" }, undefined)).toBeNull();
    expect(stepDeadline(undefined, clocks)).toBeNull();
  });
});

describe("progressOf", () => {
  const steps = ["a", "b", "c"].map(STEP);

  it("counts ticked steps", () => {
    expect(progressOf(steps, ["a", "c"])).toEqual({ done: 2, total: 3 });
    expect(progressOf(steps, [])).toEqual({ done: 0, total: 3 });
  });

  it("ignores ticks for steps that are not in this plan, and repeats", () => {
    expect(progressOf(steps, ["a", "a", "zzz"])).toEqual({ done: 1, total: 3 });
  });

  it("reaches all done exactly when everything is ticked", () => {
    expect(progressOf(steps, ["a", "b", "c"])).toEqual({ done: 3, total: 3 });
  });

  it("copes with nothing", () => {
    expect(progressOf(undefined, undefined)).toEqual({ done: 0, total: 0 });
  });
});

const UNAUTH = {
  goldenHour: { minutesLeft: 30, expired: false },
  bankReport: { deadline: "2026-09-22T23:59:59+05:30" },
  limitedLiability: { until: "2026-09-28T23:59:59+05:30" },
  shadowCredit: { by: "2026-10-05T23:59:59+05:30" },
  resolution: { by: "2026-12-18T14:00:00+05:30" },
  ombudsman: { eligibleFrom: "2026-10-19T14:00:00+05:30", url: "https://cms.rbi.org.in" },
};

describe("timelineRows", () => {
  it("has the four rows in order, and not the bank deadline", () => {
    const rows = timelineRows(UNAUTH);
    expect(rows.map((r) => r.id)).toEqual([
      "limitedLiability", "shadowCredit", "ombudsman", "resolution",
    ]);
    expect(rows.find((r) => r.id === "bankReport")).toBeUndefined();
  });

  it("carries the labels format.js already uses, verbatim", () => {
    const known = Object.fromEntries(deadlineRows(UNAUTH).map((r) => [r.id, r.label]));
    for (const row of timelineRows(UNAUTH)) expect(row.label).toBe(known[row.id]);
    expect(timelineRows(UNAUTH).map((r) => r.label)).toEqual([
      "Limited-liability window ends",
      "Bank should credit the amount back (shadow credit)",
      "You can complain to the RBI Ombudsman from",
      "Bank must resolve your complaint by",
    ]);
  });

  it("says what each date means, and whether it is the victim's to act on", () => {
    const rows = Object.fromEntries(timelineRows(UNAUTH).map((r) => [r.id, r]));
    expect(rows.limitedLiability).toMatchObject({
      note: "estimated — act before this date", userDeadline: true,
    });
    expect(rows.shadowCredit).toMatchObject({
      note: "estimated — the bank should do this by then", userDeadline: false,
    });
    expect(rows.ombudsman).toMatchObject({
      note: "estimated — you can do this from this date", userDeadline: false,
    });
    expect(rows.resolution).toMatchObject({
      note: "estimated — the bank's deadline", userDeadline: false,
    });
  });

  it("makes limited liability the only date the victim can act on", () => {
    const mine = timelineRows(UNAUTH).filter((r) => r.userDeadline).map((r) => r.id);
    expect(mine).toEqual(["limitedLiability"]);
  });

  it("puts the RBI link on the ombudsman row only", () => {
    const withUrl = timelineRows(UNAUTH).filter((r) => r.url).map((r) => [r.id, r.url]);
    expect(withUrl).toEqual([["ombudsman", "https://cms.rbi.org.in"]]);
  });

  it("carries the instant, for the date and the relative day", () => {
    const row = timelineRows(UNAUTH)[0];
    expect(row.iso).toBe("2026-09-28T23:59:59+05:30");
  });

  it("has only the ombudsman row on the authorised path", () => {
    const authorised = { goldenHour: UNAUTH.goldenHour, ombudsman: UNAUTH.ombudsman };
    expect(timelineRows(authorised).map((r) => r.id)).toEqual(["ombudsman"]);
  });

  it("never invents a row for a clock that is not there", () => {
    expect(timelineRows({})).toEqual([]);
    expect(timelineRows(undefined)).toEqual([]);
    expect(timelineRows({ shadowCredit: { by: "" } })).toEqual([]);
  });
});

describe("splitPlaceholders", () => {
  it("marks the bracketed parts and keeps the brackets", () => {
    expect(splitPlaceholders("My name is [your name] and my number is [your number].")).toEqual([
      { text: "My name is ", placeholder: false },
      { text: "[your name]", placeholder: true },
      { text: " and my number is ", placeholder: false },
      { text: "[your number]", placeholder: true },
      { text: ".", placeholder: false },
    ]);
  });

  it("works for Hindi", () => {
    expect(splitPlaceholders("मेरा नाम [अपना नाम] है।")).toEqual([
      { text: "मेरा नाम ", placeholder: false },
      { text: "[अपना नाम]", placeholder: true },
      { text: " है।", placeholder: false },
    ]);
  });

  it("handles a placeholder at the very start and the very end", () => {
    expect(splitPlaceholders("[a] middle [b]")).toEqual([
      { text: "[a]", placeholder: true },
      { text: " middle ", placeholder: false },
      { text: "[b]", placeholder: true },
    ]);
  });

  it("returns one plain part when there is nothing to mark", () => {
    expect(splitPlaceholders("Nothing to fill in.")).toEqual([
      { text: "Nothing to fill in.", placeholder: false },
    ]);
  });

  it("does not treat an unclosed or empty bracket as a placeholder", () => {
    expect(splitPlaceholders("half [open")).toEqual([{ text: "half [open", placeholder: false }]);
    expect(splitPlaceholders("empty [] brackets")).toEqual([
      { text: "empty [] brackets", placeholder: false },
    ]);
  });

  it("loses nothing: the parts always join back to the original", () => {
    const text = "Rs [amount] on [date] from [not known], thanks.";
    expect(splitPlaceholders(text).map((p) => p.text).join("")).toBe(text);
  });

  it("returns [] for empty or non-text input", () => {
    expect(splitPlaceholders("")).toEqual([]);
    expect(splitPlaceholders(null)).toEqual([]);
    expect(splitPlaceholders(undefined)).toEqual([]);
  });
});

describe("golden hour countdown", () => {
  const plan = { minutesLeft: 3, expired: false, message: null };
  const START = 1_000_000_000_000;
  const goldenHourText = (plan, end, now) => goldenHourLine(goldenHourAt(plan, end, now));
  const end = goldenHourEnd(plan, START);

  it("ends minutesLeft minutes after the plan arrived", () => {
    expect(end).toBe(START + 3 * 60000);
  });

  it("starts at exactly the minutes the plan said - not one fewer", () => {
    expect(minutesLeftAt(end, START)).toBe(3);
    expect(goldenHourText(plan, end, START)).toBe("About 3 minutes left in the first hour");
  });

  it("counts down and never rounds up", () => {
    expect(minutesLeftAt(end, START + 30_000)).toBe(2); // 2.5 min left
    expect(minutesLeftAt(end, START + 60_000)).toBe(2);
    expect(minutesLeftAt(end, START + 61_000)).toBe(1);
    expect(minutesLeftAt(end, START + 119_000)).toBe(1);
    expect(minutesLeftAt(end, START + 120_000)).toBe(1);
    expect(minutesLeftAt(end, START + 121_000)).toBe(0);
  });

  it("says 'minute' for one", () => {
    expect(goldenHourText(plan, end, START + 61_000)).toBe(
      "About 1 minute left in the first hour",
    );
  });

  it("switches to the expired message when it reaches zero", () => {
    expect(goldenHourAt(plan, end, START + 121_000)).toMatchObject({ expired: true, minutesLeft: 0 });
    expect(goldenHourText(plan, end, START + 121_000)).toBe(
      "Call 1930 anyway — money can still sometimes be frozen.",
    );
  });

  it("never goes below zero or back again", () => {
    expect(minutesLeftAt(end, START + 10 * 60000)).toBe(0);
    expect(goldenHourAt(plan, end, START + 10 * 60000).expired).toBe(true);
  });

  it("keeps a plan that was already expired exactly as the backend wrote it", () => {
    const gone = { expired: true, minutesLeft: -20, message: "The backend's own words." };
    expect(goldenHourAt(gone, goldenHourEnd(gone, START), START)).toBe(gone);
    expect(goldenHourText(gone, goldenHourEnd(gone, START), START)).toBe("The backend's own words.");
  });

  it("has no line when the plan has no golden hour", () => {
    expect(goldenHourAt(undefined, START, START)).toBeNull();
    expect(goldenHourText(undefined, START, START)).toBeNull();
  });

  it("treats nonsense minutes as none left", () => {
    expect(goldenHourEnd({ minutesLeft: "soon" }, START)).toBe(START);
    expect(goldenHourEnd({ minutesLeft: -5 }, START)).toBe(START);
  });
});

/** An in-memory stand-in for localStorage. */
function memory(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; },
  };
}

const broken = {
  getItem() { throw new Error("blocked"); },
  setItem() { throw new Error("full"); },
  removeItem() { throw new Error("blocked"); },
};

const CASE = "abcdefghijklmnopqrstuv";
// The real thing: Node has crypto.subtle, as a secure-context browser does.
const SUBTLE = globalThis.crypto.subtle;

describe("the ticks key (D136): a fingerprint of the case ID, never the ID", () => {
  it("is 'thaam:ticks:' and 16 lowercase hex characters", async () => {
    expect(await ticksKey(CASE)).toMatch(/^thaam:ticks:[0-9a-f]{16}$/);
  });

  it("is the first 16 hex characters of the SHA-256 of the ID", async () => {
    // SHA-256("abc") = ba7816bf 8f01cfea 414140de 5dae2223 ...
    expect(await ticksKey("abc")).toBe("thaam:ticks:ba7816bf8f01cfea");
  });

  it("never contains the case ID, and is the same short length whatever the ID", async () => {
    for (const id of [CASE, "Zx9_-Qw3EaBcDeFgHiJkLm", "0000000000000000000000", "abc"]) {
      const key = await ticksKey(id);
      expect(key, id).not.toContain(id);
      expect(key).toHaveLength("thaam:ticks:".length + 16);
    }
  });

  it("is the same for the same ID, every time", async () => {
    expect(await ticksKey(CASE)).toBe(await ticksKey(CASE));
    expect(await ticksKey(CASE, SUBTLE)).toBe(await ticksKey(CASE));
  });

  it("differs between IDs, and a one-character change changes it entirely", async () => {
    const a = await ticksKey(CASE);
    const b = await ticksKey(`${CASE.slice(0, -1)}w`);
    expect(a).not.toBe(b);
    // Avalanche: not a key that shares a prefix with its neighbour.
    expect(a.slice("thaam:ticks:".length, "thaam:ticks:".length + 4))
      .not.toBe(b.slice("thaam:ticks:".length, "thaam:ticks:".length + 4));
  });

  it("is null with no crypto.subtle - never a fallback to the raw ID", async () => {
    expect(await ticksKey(CASE, null)).toBeNull();
  });

  it("is null if hashing fails", async () => {
    const throwsSync = { digest() { throw new Error("no"); } };
    const rejects = { digest: () => Promise.reject(new Error("no")) };
    expect(await ticksKey(CASE, throwsSync)).toBeNull();
    expect(await ticksKey(CASE, rejects)).toBeNull();
  });

  it("is null without a usable case ID", async () => {
    for (const bad of [undefined, null, "", 0, 42, {}]) {
      expect(await ticksKey(bad), String(bad)).toBeNull();
    }
  });
});

describe("ticks", () => {
  const KEY = "thaam:ticks:0123456789abcdef";

  it("saves a JSON array of step ids and loads it back", () => {
    const store = memory();
    saveTicks(KEY, ["call_1930", "keep_ack"], store);
    expect(store.data[KEY]).toBe('["call_1930","keep_ack"]');
    expect(loadTicks(KEY, store)).toEqual(["call_1930", "keep_ack"]);
  });

  it("keeps each case's ticks apart", () => {
    const store = memory();
    saveTicks("thaam:ticks:aaaaaaaaaaaaaaaa", ["a"], store);
    saveTicks("thaam:ticks:bbbbbbbbbbbbbbbb", ["b"], store);
    expect(loadTicks("thaam:ticks:aaaaaaaaaaaaaaaa", store)).toEqual(["a"]);
    expect(loadTicks("thaam:ticks:bbbbbbbbbbbbbbbb", store)).toEqual(["b"]);
  });

  it("loads [] when nothing was saved", () => {
    expect(loadTicks(KEY, memory())).toEqual([]);
  });

  it("loads [] from bad JSON rather than throwing", () => {
    expect(loadTicks(KEY, memory({ [KEY]: "{not json" }))).toEqual([]);
  });

  it("loads [] when the stored value is not an array", () => {
    expect(loadTicks(KEY, memory({ [KEY]: '{"a":1}' }))).toEqual([]);
    expect(loadTicks(KEY, memory({ [KEY]: '"a"' }))).toEqual([]);
    expect(loadTicks(KEY, memory({ [KEY]: "null" }))).toEqual([]);
  });

  it("drops anything in the array that is not a step id", () => {
    expect(loadTicks(KEY, memory({ [KEY]: '["a",1,null,{"x":1},"b"]' }))).toEqual(["a", "b"]);
  });

  it("clears the key", () => {
    const store = memory();
    saveTicks(KEY, ["a"], store);
    clearTicks(KEY, store);
    expect(store.data).toEqual({});
    expect(loadTicks(KEY, store)).toEqual([]);
  });

  it("clears only its own case", () => {
    const store = memory();
    saveTicks("thaam:ticks:aaaaaaaaaaaaaaaa", ["a"], store);
    saveTicks("thaam:ticks:bbbbbbbbbbbbbbbb", ["b"], store);
    clearTicks("thaam:ticks:aaaaaaaaaaaaaaaa", store);
    expect(Object.keys(store.data)).toEqual(["thaam:ticks:bbbbbbbbbbbbbbbb"]);
  });

  it("leaves nothing behind when the last tick is removed", () => {
    const store = memory();
    saveTicks(KEY, ["a"], store);
    saveTicks(KEY, [], store);
    expect(store.data).toEqual({});
  });

  it("never throws when storage is blocked or full", () => {
    expect(loadTicks(KEY, broken)).toEqual([]);
    expect(() => saveTicks(KEY, ["a"], broken)).not.toThrow();
    expect(() => saveTicks(KEY, [], broken)).not.toThrow();
    expect(() => clearTicks(KEY, broken)).not.toThrow();
  });

  it("falls back to a no-op when there is no storage at all", () => {
    // Node has no window.localStorage: this is the default path under test.
    expect(loadTicks(KEY)).toEqual([]);
    expect(() => saveTicks(KEY, ["a"])).not.toThrow();
    expect(() => clearTicks(KEY)).not.toThrow();
  });
});

describe("ticks without crypto.subtle (an insecure context, e.g. http://192.168.x.x)", () => {
  // The whole path, as the plan page runs it: key first, then storage.
  async function run(store, caseId = CASE) {
    const key = await ticksKey(caseId, null);
    return {
      key,
      loaded: loadTicks(key, store),
      save: (ids) => saveTicks(key, ids, store),
      clear: () => clearTicks(key, store),
    };
  }

  it("has no key, so nothing can be stored under one", async () => {
    expect((await run(memory())).key).toBeNull();
  });

  it("writes nothing to storage - not under the raw ID, not under anything", async () => {
    const store = memory();
    const ticks = await run(store);
    ticks.save(["call_1930", "keep_ack"]);
    ticks.save(["call_1930"]);
    ticks.save([]);
    ticks.clear();
    expect(store.data).toEqual({});
  });

  it("does not touch storage at all: not even a read", async () => {
    let touched = 0;
    const spy = {
      getItem() { touched += 1; return null; },
      setItem() { touched += 1; },
      removeItem() { touched += 1; },
    };
    const ticks = await run(spy);
    ticks.save(["a"]);
    ticks.clear();
    expect(ticks.loaded).toEqual([]);
    expect(touched).toBe(0);
  });

  it("never lets the case ID into a key, whatever is passed", async () => {
    const store = memory();
    saveTicks(await ticksKey(CASE, null), ["a"], store);
    expect(Object.keys(store.data).some((k) => k.includes(CASE))).toBe(false);
    expect(store.data).toEqual({});
  });
});

describe("extraDisclaimers", () => {
  const TODAY = [
    "Thaam is not a government service and is not affiliated with I4C, NCRP, RBI or any bank.",
    "This is guidance, not legal advice.",
    "Deadlines are estimated; act before the dates shown.",
  ];

  it("is the footer's own three lines", () => {
    expect(FOOTER_DISCLAIMERS).toEqual(TODAY);
  });

  it("drops all three lines the backend sends today, so nothing is repeated", () => {
    expect(extraDisclaimers(TODAY)).toEqual([]);
  });

  it("keeps a line the footer does not have", () => {
    expect(extraDisclaimers([...TODAY, "A new legal line."])).toEqual(["A new legal line."]);
  });

  it("keeps a line that is only nearly the same", () => {
    // A full stop, a capital, a space - each makes it a different sentence.
    const near = [
      "This is guidance, not legal advice",
      "this is guidance, not legal advice.",
      "This is guidance, not legal advice. ",
      "This is guidance,  not legal advice.",
    ];
    expect(extraDisclaimers(near)).toEqual(near);
  });

  it("keeps the order of what it keeps", () => {
    expect(extraDisclaimers(["B.", TODAY[0], "A.", TODAY[2]])).toEqual(["B.", "A."]);
  });

  it("copes with anything that is not a list of text", () => {
    expect(extraDisclaimers(undefined)).toEqual([]);
    expect(extraDisclaimers(null)).toEqual([]);
    expect(extraDisclaimers("text")).toEqual([]);
    expect(extraDisclaimers([null, 3, "", "Real."])).toEqual(["Real."]);
  });

  it("compares against a footer it is given", () => {
    expect(extraDisclaimers(["a", "b"], ["a"])).toEqual(["b"]);
  });
});
