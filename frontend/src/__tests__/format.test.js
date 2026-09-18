import { describe, expect, it } from "vitest";
import { deadlineRows, ESTIMATED_NOTE, formatIstDate, goldenHourLine } from "../format";

// The clocks POST /plan really returns for a case planned on 17 Sep 2026.
const UNAUTHORISED = {
  goldenHour: {
    deadline: "2026-09-17T11:41:07+05:30",
    minutesLeft: -20,
    expired: true,
    message: "Call 1930 anyway — money can still sometimes be frozen.",
    estimated: true,
  },
  bankReport: { deadline: "2026-09-19T23:59:59+05:30", estimated: true },
  limitedLiability: { until: "2026-09-24T23:59:59+05:30", estimated: true },
  shadowCredit: { by: "2026-09-29T23:59:59+05:30", estimated: true },
  resolution: { by: "2026-12-16T11:01:07+05:30", estimated: true },
  ombudsman: {
    eligibleFrom: "2026-10-17T11:01:07+05:30",
    url: "https://cms.rbi.org.in",
    estimated: true,
  },
};

// The authorised path: no liability cap exists, so those clocks do not either.
const AUTHORISED = {
  goldenHour: UNAUTHORISED.goldenHour,
  resolution: UNAUTHORISED.resolution,
  ombudsman: UNAUTHORISED.ombudsman,
};

describe("formatIstDate", () => {
  it("formats an IST deadline", () => {
    expect(formatIstDate("2026-09-19T23:59:59+05:30")).toBe("Sat, 19 Sep 2026");
    expect(formatIstDate("2026-10-17T11:01:07+05:30")).toBe("Sat, 17 Oct 2026");
    expect(formatIstDate("2026-12-16T11:01:07+05:30")).toBe("Wed, 16 Dec 2026");
  });

  it("shows the Indian date whatever zone the value carries", () => {
    // 20:00 UTC on the 18th is 01:30 on the 19th in Kolkata.
    expect(formatIstDate("2026-09-18T20:00:00Z")).toBe("Sat, 19 Sep 2026");
    expect(formatIstDate("2026-09-18T18:00:00Z")).toBe("Fri, 18 Sep 2026");
  });

  it("abbreviates the month to three letters", () => {
    expect(formatIstDate("2026-09-01T10:00:00+05:30")).toBe("Tue, 1 Sep 2026");
    expect(formatIstDate("2026-06-01T10:00:00+05:30")).toBe("Mon, 1 Jun 2026");
    expect(formatIstDate("2026-05-01T10:00:00+05:30")).toBe("Fri, 1 May 2026");
  });

  it("returns nothing for a value it cannot read", () => {
    for (const value of ["", null, undefined, "not a date", 42]) {
      expect(formatIstDate(value)).toBe("");
    }
  });
});

describe("deadlineRows", () => {
  it("lists the unauthorised clocks in order, with their labels", () => {
    const rows = deadlineRows(UNAUTHORISED);
    expect(rows.map((row) => row.id)).toEqual([
      "bankReport", "limitedLiability", "shadowCredit", "ombudsman", "resolution",
    ]);
    expect(rows[0].label).toBe("Tell your bank in writing — for zero liability");
    expect(rows[0].date).toBe("Sat, 19 Sep 2026");
    expect(rows[1].label).toBe("Limited-liability window ends");
    expect(rows[2].label).toBe("Bank should credit the amount back (shadow credit)");
    expect(rows[3].label).toBe("You can complain to the RBI Ombudsman from");
    expect(rows[4].label).toBe("Bank must resolve your complaint by");
  });

  it("never invents a liability clock on the authorised path", () => {
    const rows = deadlineRows(AUTHORISED);
    expect(rows.map((row) => row.id)).toEqual(["ombudsman", "resolution"]);
    const text = JSON.stringify(rows);
    expect(text).not.toContain("zero liability");
    expect(text).not.toContain("Limited-liability");
  });

  it("carries the ombudsman link and no other", () => {
    const rows = deadlineRows(UNAUTHORISED);
    expect(rows.find((row) => row.id === "ombudsman").url).toBe("https://cms.rbi.org.in");
    expect(rows.filter((row) => row.url)).toHaveLength(1);
  });

  it("skips a clock whose date is missing, and copes with nothing at all", () => {
    expect(deadlineRows({ ...UNAUTHORISED, bankReport: {} }).map((r) => r.id))
      .toEqual(["limitedLiability", "shadowCredit", "ombudsman", "resolution"]);
    expect(deadlineRows({})).toEqual([]);
    expect(deadlineRows(null)).toEqual([]);
    expect(deadlineRows(undefined)).toEqual([]);
  });

  it("never lists the golden hour as a deadline row", () => {
    expect(deadlineRows(UNAUTHORISED).some((row) => row.id === "goldenHour")).toBe(false);
  });

  it("says every date is an estimate", () => {
    expect(ESTIMATED_NOTE).toBe("estimated — act before this date");
  });
});

describe("goldenHourLine", () => {
  it("counts the minutes left while the hour is alive", () => {
    expect(goldenHourLine({ expired: false, minutesLeft: 40 }))
      .toBe("About 40 minutes left in the first hour");
    expect(goldenHourLine({ expired: false, minutesLeft: 1 }))
      .toBe("About 1 minute left in the first hour");
    expect(goldenHourLine({ expired: false, minutesLeft: 0 }))
      .toBe("About 0 minutes left in the first hour");
  });

  it("uses the backend's own message once it has gone", () => {
    expect(goldenHourLine(UNAUTHORISED.goldenHour))
      .toBe("Call 1930 anyway — money can still sometimes be frozen.");
    expect(goldenHourLine({ expired: true })).toMatch(/Call 1930 anyway/);
  });

  it("never shows a negative count", () => {
    expect(goldenHourLine({ expired: false, minutesLeft: -20 }))
      .toBe("About 0 minutes left in the first hour");
  });

  it("has nothing to say without a clock", () => {
    expect(goldenHourLine(null)).toBeNull();
    expect(goldenHourLine(undefined)).toBeNull();
  });
});
