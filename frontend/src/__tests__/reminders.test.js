import { describe, expect, it } from "vitest";
import { formatIstDate } from "../format";
import {
  FAMILY_MAX_SENDS, fromCase, fromEnrolment, isDemoMode, isEnrolled, looksLikeEmail,
  sharesLine, SKIP_REASONS, stepLabel, stepStatus, STEP_ORDER,
} from "../reminders";

// The six step keys the backend schedules.
const ALL_STEPS = ["bank_ack", "portal_status", "liability_window",
  "shadow_credit", "ombudsman", "closeout"];

describe("stepLabel", () => {
  it("uses the words from the email subject lines, without the prefix", () => {
    expect(stepLabel("bank_ack")).toBe("Your bank deadline");
    expect(stepLabel("liability_window")).toBe("Liability window closing");
    expect(stepLabel("shadow_credit")).toBe("Provisional credit due");
    expect(stepLabel("ombudsman")).toBe("You can escalate now");
    expect(stepLabel("closeout")).toBe("Final check-in");
    expect(stepLabel("portal_status")).toBe("Check your complaint status");
  });

  it("labels every step the backend can send", () => {
    for (const step of ALL_STEPS) {
      expect(stepLabel(step)).not.toBe(step);
      expect(stepLabel(step)).not.toMatch(/Thaam:/);
      expect(STEP_ORDER).toContain(step);
    }
  });

  it("falls back to the key rather than showing nothing", () => {
    expect(stepLabel("something_new")).toBe("something_new");
    expect(stepLabel(undefined)).toBeUndefined();
  });
});

describe("stepStatus", () => {
  const DATE = "2026-09-18T10:00:00+05:30";

  it("shows the date of a step that is simply waiting", () => {
    expect(stepStatus({ step: "bank_ack", status: "scheduled", fireAt: DATE }, formatIstDate))
      .toEqual({ tone: "due", text: "Fri, 18 Sep 2026" });
  });

  it("says Soon for an urgent step", () => {
    expect(stepStatus({ status: "scheduled", fireAt: DATE, urgent: true }, formatIstDate))
      .toEqual({ tone: "soon", text: "Soon" });
  });

  it("D114: sentAt beats everything else on the record", () => {
    const sent = { status: "scheduled", fireAt: DATE, sentAt: "2026-09-18T04:30:11+00:00" };
    expect(stepStatus(sent, formatIstDate)).toEqual({ tone: "sent", text: "Sent ✓" });
    // Even when the record still calls it urgent, or skipped.
    expect(stepStatus({ ...sent, urgent: true }, formatIstDate).text).toBe("Sent ✓");
    expect(stepStatus({ ...sent, status: "skipped", reason: "deadline_passed" }, formatIstDate).text)
      .toBe("Sent ✓");
  });

  it("explains why a step was skipped", () => {
    expect(stepStatus({ status: "skipped", reason: "deadline_passed" }, formatIstDate))
      .toEqual({ tone: "skipped", text: "Skipped — this date has already passed" });
    expect(stepStatus({ status: "skipped", reason: "case_expiring" }, formatIstDate))
      .toEqual({ tone: "skipped", text: "Skipped — your case closes before this date" });
    expect(SKIP_REASONS.deadline_passed).toBe("Skipped — this date has already passed");
  });

  it("says only 'Skipped' when the reason was not returned", () => {
    // GET /cases/{id} does not carry a skipped step's reason.
    expect(stepStatus({ status: "skipped", fireAt: null }, formatIstDate))
      .toEqual({ tone: "skipped", text: "Skipped" });
    expect(stepStatus({ status: "skipped", reason: "something_new" }, formatIstDate).text)
      .toBe("Skipped");
  });

  it("shows nothing rather than a broken date", () => {
    expect(stepStatus({ status: "scheduled", fireAt: null }, formatIstDate).text).toBe("");
    expect(stepStatus(null, formatIstDate).text).toBe("");
  });
});

describe("fromEnrolment", () => {
  const RESPONSE = {
    enrolled: true,
    steps: [
      { step: "liability_window", fireAt: "2026-09-23T10:00:00+05:30", urgent: false },
      { step: "ombudsman", fireAt: "2026-10-17T11:01:07+05:30", urgent: false },
    ],
    skipped: [{ step: "bank_ack", reason: "deadline_passed" }],
  };

  it("merges scheduled and skipped into one list, in cadence order", () => {
    const reminders = fromEnrolment(RESPONSE);
    expect(reminders.status).toBe("active");
    expect(reminders.demo).toBe(false);
    expect(reminders.steps.map((s) => s.step))
      .toEqual(["bank_ack", "liability_window", "ombudsman"]);
    expect(reminders.steps[0].status).toBe("skipped");
    expect(reminders.steps[0].fireAt).toBeNull();
    expect(reminders.steps[1].status).toBe("scheduled");
  });

  it("nothing is sent yet at the moment of enrolling", () => {
    expect(fromEnrolment(RESPONSE).steps.every((s) => s.sentAt === null)).toBe(true);
  });

  it("remembers that demo timing was asked for", () => {
    expect(fromEnrolment(RESPONSE, true).demo).toBe(true);
  });

  it("copes with a response that skipped nothing", () => {
    expect(fromEnrolment({ steps: RESPONSE.steps }).steps).toHaveLength(2);
    expect(fromEnrolment({}).steps).toEqual([]);
  });
});

describe("fromCase", () => {
  it("orders what GET /cases/{id} returns", () => {
    const reminders = fromCase({
      status: "active",
      demo: false,
      steps: [
        { step: "closeout", fireAt: "2026-12-11T10:00:00+05:30", status: "scheduled", sentAt: null },
        { step: "bank_ack", fireAt: "2026-09-18T10:00:00+05:30", status: "scheduled",
          sentAt: "2026-09-18T04:30:11+00:00" },
      ],
    });
    expect(reminders.steps.map((s) => s.step)).toEqual(["bank_ack", "closeout"]);
    expect(reminders.status).toBe("active");
  });

  it("is null when the case was never enrolled", () => {
    expect(fromCase(null)).toBeNull();
    expect(fromCase(undefined)).toBeNull();
  });

  it("keeps a cancelled enrolment visible", () => {
    const reminders = fromCase({ status: "cancelled", demo: false, steps: [] });
    expect(reminders.status).toBe("cancelled");
    expect(isEnrolled(reminders)).toBe(false);
  });
});

describe("isEnrolled", () => {
  it("is true only while the cadence is active", () => {
    expect(isEnrolled({ status: "active" })).toBe(true);
    expect(isEnrolled({ status: "cancelled" })).toBe(false);
    expect(isEnrolled(null)).toBe(false);
  });
});

describe("sharesLine", () => {
  it("counts the shares left", () => {
    expect(sharesLine(3)).toBe("You can share this 3 more times");
    expect(sharesLine(2)).toBe("You can share this 2 more times");
    expect(sharesLine(1)).toBe("You can share this 1 more time");
  });

  it("says the budget is gone at zero", () => {
    expect(sharesLine(0)).toBe("You've used all 3 shares for this case.");
    expect(sharesLine(-1)).toBe("You've used all 3 shares for this case.");
    expect(FAMILY_MAX_SENDS).toBe(3);
  });

  it("assumes the full budget when the count is unknown", () => {
    expect(sharesLine(undefined)).toBe("You can share this 3 more times");
    expect(sharesLine(null)).toBe("You can share this 3 more times");
  });
});

describe("isDemoMode", () => {
  it("is on only for ?demo=1 (D112)", () => {
    expect(isDemoMode("?demo=1")).toBe(true);
    expect(isDemoMode("?a=b&demo=1")).toBe(true);
    expect(isDemoMode("?demo=1&a=b")).toBe(true);
  });

  it("is off for anything else", () => {
    for (const search of ["", "?", "?demo=0", "?demo", "?demo=true", "?demo=2",
      "?nodemo=1", "?DEMO=1", null, undefined]) {
      expect(isDemoMode(search)).toBe(false);
    }
  });
});

describe("looksLikeEmail", () => {
  it("lets a plausible address through", () => {
    for (const value of ["a@b.com", "victim@example.co.in", " spaced@example.com "]) {
      expect(looksLikeEmail(value)).toBe(true);
    }
  });

  it("keeps the button disabled for anything else", () => {
    for (const value of ["", "  ", "not-an-email", "a@b", "a b@c.com", "a@@b.com",
      `${"x".repeat(250)}@e.com`, null, undefined, 42]) {
      expect(looksLikeEmail(value)).toBe(false);
    }
  });
});
