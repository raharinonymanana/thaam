import { describe, expect, it } from "vitest";
import {
  countFound, FIELD_KEYS, initialState, pickFields, planPayload, reducer,
  SHARE_LIMIT_MESSAGE,
} from "../state";

const FIELDS = {
  amount: "49999.00",
  utr: "426173859012",
  txn_date: "2026-09-17",
  txn_time: "10:41:07",
  account_masked: "XX1234",
  payee_vpa: "refund.help99@okaxis",
  payee_phone: null,
  bank: "Sample Bank",
  // extract returns these too; they are not part of the eight.
  sender_id: "VK-SBIINB",
  direction: "debit",
  missing: ["payee_phone"],
};

const CASE_ID = "abcdefghijklmnopqrstuv";

function run(actions, from = initialState) {
  return actions.reduce(reducer, from);
}

describe("initial state", () => {
  it("starts on welcome with nothing given away", () => {
    expect(initialState.screen).toBe("welcome");
    expect(initialState.consent).toBe(false);
    expect(initialState.caseId).toBeNull();
    expect(initialState.busy).toBe(false);
  });
});

describe("welcome (S0)", () => {
  it("continues to consent and changes nothing else", () => {
    const state = reducer(initialState, { type: "welcome_continued" });
    expect(state.screen).toBe("consent");
    expect(state).toEqual({ ...initialState, screen: "consent" });
  });

  it("is ignored anywhere but the welcome screen", () => {
    const onConsent = reducer(initialState, { type: "welcome_continued" });
    expect(reducer(onConsent, { type: "welcome_continued" })).toBe(onConsent);

    const onPlan = reducer(initialState, { type: "plan_succeeded", plan: { path: "unauthorised" } });
    expect(reducer(onPlan, { type: "welcome_continued" })).toBe(onPlan);
  });

  it("cannot skip consent: upload is still unreachable from welcome", () => {
    const state = reducer(initialState, { type: "consent_given" });
    expect(state.screen).toBe("welcome");
    expect(state).toBe(initialState);
  });

  it("is the first step of the whole flow", () => {
    const state = run([
      { type: "welcome_continued" },
      { type: "consent_toggled", value: true },
      { type: "consent_given" },
    ]);
    expect(state.screen).toBe("upload");
  });
});

describe("consent", () => {
  it("records the checkbox", () => {
    expect(reducer(initialState, { type: "consent_toggled", value: true }).consent).toBe(true);
    const on = reducer(initialState, { type: "consent_toggled", value: true });
    expect(reducer(on, { type: "consent_toggled", value: false }).consent).toBe(false);
  });

  it("only anything but true is false", () => {
    expect(reducer(initialState, { type: "consent_toggled", value: "yes" }).consent).toBe(false);
  });

  it("moves to upload once agreed", () => {
    const state = run([
      { type: "consent_toggled", value: true },
      { type: "consent_given" },
    ]);
    expect(state.screen).toBe("upload");
  });

  it("refuses to move on without consent", () => {
    const onConsent = reducer(initialState, { type: "welcome_continued" });
    const state = reducer(onConsent, { type: "consent_given" });
    expect(state.screen).toBe("consent");
    expect(state).toBe(onConsent);
  });
});

describe("upload and extract", () => {
  const agreed = run([
    { type: "consent_toggled", value: true },
    { type: "consent_given" },
  ]);

  it("keeps the chosen file and clears it again", () => {
    const file = { name: "sms.png" };
    const chosen = reducer(agreed, { type: "file_chosen", file });
    expect(chosen.file).toBe(file);
    expect(reducer(chosen, { type: "file_chosen", file: null }).file).toBeNull();
  });

  it("marks the app busy while a call is in flight", () => {
    const busy = reducer(agreed, { type: "submit_started" });
    expect(busy.busy).toBe(true);
    expect(busy.error).toBeNull();
  });

  it("keeps the caseId in memory and moves to extracting", () => {
    const state = run([
      { type: "submit_started" },
      { type: "uploaded", caseId: CASE_ID },
    ], agreed);
    expect(state.screen).toBe("extracting");
    expect(state.caseId).toBe(CASE_ID);
    expect(state.busy).toBe(true);
  });

  it("clears busy and shows the error when a call fails", () => {
    const error = { message: "We could not reach Thaam.", code: "network" };
    const state = run([{ type: "submit_started" }, { type: "submit_failed", error }], agreed);
    expect(state.busy).toBe(false);
    expect(state.error).toEqual(error);
    expect(state.screen).toBe("upload");
  });

  it("lands on fields with the eight details only", () => {
    const state = run([
      { type: "submit_started" },
      { type: "uploaded", caseId: CASE_ID },
      { type: "extract_succeeded", fields: FIELDS },
    ], agreed);
    expect(state.screen).toBe("fields");
    expect(state.busy).toBe(false);
    expect(state.unreadable).toBe(false);
    expect(Object.keys(state.fields)).toEqual(FIELD_KEYS);
    expect(state.fields.sender_id).toBeUndefined();
    // Empty text, not null: these values go straight into controlled inputs.
    expect(state.fields.payee_phone).toBe("");
  });

  it("treats an unreadable image as a normal step forward, not an error", () => {
    const state = run([
      { type: "uploaded", caseId: CASE_ID },
      { type: "extract_unreadable" },
    ], agreed);
    expect(state.screen).toBe("fields");
    expect(state.unreadable).toBe(true);
    expect(state.error).toBeNull();
    expect(state.caseId).toBe(CASE_ID);
    expect(Object.values(state.fields).every((value) => value === "")).toBe(true);
  });

  it("a retry after a failed extract clears the error", () => {
    const state = run([
      { type: "uploaded", caseId: CASE_ID },
      { type: "submit_failed", error: { message: "x" } },
      { type: "extract_started" },
    ], agreed);
    expect(state.screen).toBe("extracting");
    expect(state.busy).toBe(true);
    expect(state.error).toBeNull();
  });
});

describe("returning victim", () => {
  it("loads a case", () => {
    const state = run([
      { type: "case_requested", caseId: CASE_ID },
      { type: "case_loaded", caseView: { path: "unauthorised" } },
    ]);
    expect(state.screen).toBe("case");
    expect(state.busy).toBe(false);
    expect(state.caseView).toEqual({ path: "unauthorised" });
    expect(state.notFound).toBe(false);
  });

  it("reports a case that has expired or never existed", () => {
    const state = run([
      { type: "case_requested", caseId: CASE_ID },
      { type: "case_not_found" },
    ]);
    expect(state.notFound).toBe(true);
    expect(state.caseView).toBeNull();
    expect(state.busy).toBe(false);
  });

  it("start again drops the caseId and everything else", () => {
    const state = run([
      { type: "case_requested", caseId: CASE_ID },
      { type: "case_loaded", caseView: { path: "unauthorised" } },
      { type: "restart" },
    ]);
    expect(state).toEqual(initialState);
    expect(state.caseId).toBeNull();
  });
});

describe("fields, triage and the plan", () => {
  const onFields = run([
    { type: "uploaded", caseId: CASE_ID },
    { type: "extract_succeeded", fields: FIELDS },
  ]);

  it("remembers which details extract could not find", () => {
    expect(onFields.missingFields).toEqual(["payee_phone"]);
    expect(onFields.fields.payee_phone).toBe("");
    expect(onFields.fields.amount).toBe("49999.00");
  });

  it("marks every field missing when the image was unreadable", () => {
    const state = run([{ type: "extract_unreadable" }], onFields);
    expect(state.missingFields).toEqual(FIELD_KEYS);
  });

  it("typing clears that field's error and nothing else", () => {
    const withErrors = reducer(onFields, {
      type: "fields_invalid",
      errors: { amount: "bad amount", utr: "bad utr" },
      focus: "amount",
    });
    expect(withErrors.screen).toBe("fields");
    expect(withErrors.focusField).toBe("amount");

    const typed = reducer(withErrors, { type: "field_changed", key: "amount", value: "250" });
    expect(typed.fields.amount).toBe("250");
    expect(typed.fieldErrors).toEqual({ utr: "bad utr" });
    expect(typed.focusField).toBeNull();
  });

  it("goes to triage once the fields are accepted", () => {
    const state = reducer(onFields, { type: "fields_accepted" });
    expect(state.screen).toBe("triage");
    expect(state.fieldErrors).toEqual({});
    expect(state.focusField).toBeNull();
  });

  it("records the triage answer and refuses anything else", () => {
    const triage = reducer(onFields, { type: "fields_accepted" });
    expect(reducer(triage, { type: "triage_answered", shared: "not_sure" }).shared).toBe("not_sure");
    expect(reducer(triage, { type: "triage_answered", shared: "yes" }).shared).toBe("yes");
    expect(reducer(triage, { type: "triage_answered", shared: "maybe" })).toBe(triage);
    expect(reducer(triage, { type: "triage_answered", shared: null })).toBe(triage);
  });

  it("goes back to the fields from triage", () => {
    const state = run([{ type: "fields_accepted" }, { type: "back_to_fields" }], onFields);
    expect(state.screen).toBe("fields");
    expect(state.fields).toEqual(onFields.fields);
  });

  it("shows the plan once it is built", () => {
    const plan = { caseId: CASE_ID, path: "unauthorised", notSure: true, clocks: {}, steps: [] };
    const state = run([
      { type: "fields_accepted" },
      { type: "triage_answered", shared: "not_sure" },
      { type: "submit_started" },
      { type: "plan_succeeded", plan },
    ], onFields);
    expect(state.screen).toBe("plan");
    expect(state.busy).toBe(false);
    expect(state.plan).toBe(plan);
    expect(state.caseId).toBe(CASE_ID);
  });

  it("a rejected field sends the victim back to that field", () => {
    const state = run([
      { type: "fields_accepted" },
      { type: "triage_answered", shared: "no" },
      { type: "submit_started" },
      {
        type: "plan_rejected_field",
        field: "account_masked",
        message: "Enter only the last 4 digits of the account, e.g. XX1234.",
      },
    ], onFields);
    expect(state.screen).toBe("fields");
    expect(state.busy).toBe(false);
    expect(state.error).toBeNull();
    expect(state.focusField).toBe("account_masked");
    expect(state.fieldErrors.account_masked).toMatch(/last 4 digits/);
    // The answer survives, so the victim is not asked the triage question twice.
    expect(state.shared).toBe("no");
  });

  it("keeps the typed values when the server rejects one of them", () => {
    const typed = reducer(onFields, { type: "field_changed", key: "bank", value: "Sample Bank" });
    const state = reducer(typed, { type: "plan_rejected_field", field: "utr", message: "x" });
    expect(state.fields.bank).toBe("Sample Bank");
    expect(state.fields.amount).toBe("49999.00");
  });
});

describe("planPayload", () => {
  it("sends the eight keys, with empty text as null", () => {
    const payload = planPayload({ ...pickFields(FIELDS), bank: "  Sample Bank  " });
    expect(Object.keys(payload)).toEqual(FIELD_KEYS);
    expect(payload.payee_phone).toBeNull();
    expect(payload.bank).toBe("Sample Bank");
    expect(payload.sender_id).toBeUndefined();
  });
});

describe("reminders", () => {
  const onPlan = run([
    { type: "uploaded", caseId: CASE_ID },
    { type: "extract_succeeded", fields: FIELDS },
    { type: "fields_accepted" },
    { type: "triage_answered", shared: "no" },
    { type: "plan_succeeded", plan: { path: "unauthorised", clocks: {}, steps: [] } },
  ]);

  const ENROLLED = {
    steps: [{ step: "liability_window", fireAt: "2026-09-23T10:00:00+05:30", urgent: false }],
    skipped: [{ step: "bank_ack", reason: "deadline_passed" }],
  };

  it("starts with nothing enrolled and the full share budget", () => {
    expect(onPlan.reminders).toBeNull();
    expect(onPlan.family.sendsRemaining).toBe(3);
    expect(onPlan.remindersUi).toEqual({ busy: false, error: null });
  });

  it("turns them on", () => {
    const state = run([
      { type: "reminders_submitting" },
      { type: "reminders_enrolled", ...ENROLLED, demo: false },
    ], onPlan);
    expect(state.reminders.status).toBe("active");
    expect(state.reminders.demo).toBe(false);
    expect(state.reminders.steps.map((s) => s.step)).toEqual(["bank_ack", "liability_window"]);
    expect(state.remindersUi).toEqual({ busy: false, error: null });
  });

  it("records demo timing when it was asked for", () => {
    const state = reducer(onPlan, { type: "reminders_enrolled", ...ENROLLED, demo: true });
    expect(state.reminders.demo).toBe(true);
  });

  it("marks the section busy and clears the last error while submitting", () => {
    const failed = run([
      { type: "reminders_submitting" },
      { type: "reminders_failed", error: { message: "Demo timing is not enabled." } },
    ], onPlan);
    expect(failed.remindersUi.busy).toBe(false);
    expect(failed.remindersUi.error.message).toBe("Demo timing is not enabled.");
    expect(failed.reminders).toBeNull();

    const retrying = reducer(failed, { type: "reminders_submitting" });
    expect(retrying.remindersUi).toEqual({ busy: true, error: null });
  });

  it("a second attempt clears the previous attempt's error", () => {
    const state = run([
      { type: "reminders_submitting" },
      { type: "reminders_failed", error: { message: "Demo timing is not enabled." } },
      { type: "reminders_submitting" },
      { type: "reminders_enrolled", ...ENROLLED, demo: false },
    ], onPlan);
    expect(state.remindersUi.error).toBeNull();
    expect(state.reminders.status).toBe("active");
  });

  it("enrolling clears the error, so only the latest attempt is on screen", () => {
    const failed = run([
      { type: "reminders_submitting" },
      { type: "reminders_failed", error: { message: "x" } },
    ], onPlan);
    const enrolled = reducer(failed, { type: "reminders_enrolled", ...ENROLLED });
    expect(enrolled.remindersUi.error).toBeNull();
  });

  it("a failure never touches the plan itself", () => {
    const state = reducer(onPlan, { type: "reminders_failed", error: { message: "x" } });
    expect(state.screen).toBe("plan");
    expect(state.plan).toEqual(onPlan.plan);
    expect(state.error).toBeNull();
  });

  it("takes the cadence from a reopened case", () => {
    const state = run([
      { type: "case_requested", caseId: CASE_ID },
      {
        type: "case_loaded",
        caseView: {
          path: "unauthorised",
          reminders: {
            status: "active",
            demo: false,
            steps: [
              { step: "closeout", fireAt: "2026-12-11T10:00:00+05:30", status: "scheduled",
                sentAt: null },
              { step: "bank_ack", fireAt: "2026-09-18T10:00:00+05:30", status: "scheduled",
                sentAt: "2026-09-18T04:30:11+00:00" },
            ],
          },
          family: { sendsRemaining: 1 },
        },
      },
    ]);
    expect(state.reminders.steps.map((s) => s.step)).toEqual(["bank_ack", "closeout"]);
    expect(state.family.sendsRemaining).toBe(1);
  });

  it("a case that never enrolled has no cadence and the full budget", () => {
    const state = run([
      { type: "case_requested", caseId: CASE_ID },
      { type: "case_loaded", caseView: { path: "unauthorised", reminders: null } },
    ]);
    expect(state.reminders).toBeNull();
    expect(state.family.sendsRemaining).toBe(3);
  });
});

describe("share with family", () => {
  const onPlan = reducer(initialState, {
    type: "plan_succeeded", plan: { path: "unauthorised" },
  });

  it("counts a send down, using the server's own number", () => {
    const state = run([
      { type: "family_submitting" },
      { type: "family_sent", sendsRemaining: 2 },
    ], onPlan);
    expect(state.family).toEqual({ sendsRemaining: 2, sent: true });
    expect(state.familyUi).toEqual({ busy: false, error: null });
  });

  it("decrements by one if the server did not say", () => {
    expect(reducer(onPlan, { type: "family_sent" }).family.sendsRemaining).toBe(2);
  });

  it("shows a failure without spending a share", () => {
    const state = run([
      { type: "family_submitting" },
      { type: "family_failed", error: { message: "We could not send to that address" } },
    ], onPlan);
    expect(state.family.sendsRemaining).toBe(3);
    expect(state.family.sent).toBe(false);
    expect(state.familyUi.error.message).toMatch(/could not send/);
  });

  it("closes the form when the server says the three are gone", () => {
    const state = reducer(onPlan, { type: "family_limit_reached" });
    expect(state.family.sendsRemaining).toBe(0);
    expect(state.familyUi.error.message).toBe(SHARE_LIMIT_MESSAGE);
    expect(SHARE_LIMIT_MESSAGE).toBe("You've used all 3 shares for this case.");
  });

  // A send that succeeded and a later one that failed were both on screen at
  // once, so the victim could not tell which address had actually been mailed.
  describe("only the latest attempt is shown", () => {
    const sentOnce = run([
      { type: "family_submitting" },
      { type: "family_sent", sendsRemaining: 2 },
    ], onPlan);

    it("a second attempt clears the first one's success notice", () => {
      expect(sentOnce.family.sent).toBe(true);
      const again = reducer(sentOnce, { type: "family_submitting" });
      expect(again.family.sent).toBe(false);
      expect(again.familyUi).toEqual({ busy: true, error: null });
    });

    it("a rejected address never sits under a success notice", () => {
      const state = run([
        { type: "family_submitting" },
        { type: "family_failed", error: { message: "We could not send to that address" } },
      ], sentOnce);
      expect(state.family.sent).toBe(false);
      expect(state.familyUi.error.message).toMatch(/could not send/);
      // The share that did go out is still counted.
      expect(state.family.sendsRemaining).toBe(2);
    });

    it("running out of shares clears the success notice too", () => {
      const state = reducer(sentOnce, { type: "family_limit_reached" });
      expect(state.family.sent).toBe(false);
      expect(state.family.sendsRemaining).toBe(0);
      expect(state.familyUi.error.message).toBe(SHARE_LIMIT_MESSAGE);
    });

    it("a success clears the previous attempt's error", () => {
      const state = run([
        { type: "family_submitting" },
        { type: "family_failed", error: { message: "nope" } },
        { type: "family_submitting" },
        { type: "family_sent", sendsRemaining: 1 },
      ], onPlan);
      expect(state.familyUi.error).toBeNull();
      expect(state.family.sent).toBe(true);
    });

    it("never shows a success and an error at the same time", () => {
      const attempts = [
        [{ type: "family_submitting" }, { type: "family_sent", sendsRemaining: 2 }],
        [{ type: "family_submitting" }, { type: "family_failed", error: { message: "x" } }],
        [{ type: "family_submitting" }, { type: "family_limit_reached" }],
      ];
      let state = onPlan;
      for (const actions of attempts) {
        state = run(actions, state);
        expect(state.family.sent && state.familyUi.error).toBeFalsy();
      }
    });
  });
});

describe("start a new case (D117)", () => {
  const onPlan = run([
    { type: "uploaded", caseId: CASE_ID },
    { type: "extract_succeeded", fields: FIELDS },
    { type: "plan_succeeded", plan: { path: "unauthorised" } },
  ]);

  it("asks before it does anything", () => {
    const asking = reducer(onPlan, { type: "restart_requested" });
    expect(asking.confirmRestart).toBe(true);
    // Nothing else moved: the plan is still there behind the question.
    expect(asking.screen).toBe("plan");
    expect(asking.plan).toEqual(onPlan.plan);
    expect(asking.caseId).toBe(CASE_ID);
  });

  it("cancelling leaves the plan exactly as it was", () => {
    const state = run([{ type: "restart_requested" }, { type: "restart_cancelled" }], onPlan);
    expect(state).toEqual(onPlan);
  });

  it("confirming goes back to welcome with nothing carried over", () => {
    const state = run([{ type: "restart_requested" }, { type: "restart" }], onPlan);
    expect(state).toEqual(initialState);
    expect(state.screen).toBe("welcome");
    expect(state.caseId).toBeNull();
    expect(state.plan).toBeNull();
    expect(state.reminders).toBeNull();
    expect(state.confirmRestart).toBe(false);
  });
});

describe("delete my case now (D120)", () => {
  const onPlan = run([
    { type: "uploaded", caseId: CASE_ID },
    { type: "extract_succeeded", fields: FIELDS },
    { type: "plan_succeeded", plan: { path: "unauthorised" } },
  ]);

  it("asks before it deletes anything", () => {
    const asking = reducer(onPlan, { type: "delete_requested" });
    expect(asking.confirmDelete).toBe(true);
    expect(asking.screen).toBe("plan");
    expect(asking.caseId).toBe(CASE_ID);
    expect(asking.deleteUi).toEqual({ busy: false, error: null });
  });

  it("cancelling changes nothing at all", () => {
    const state = run([{ type: "delete_requested" }, { type: "delete_cancelled" }], onPlan);
    expect(state).toEqual(onPlan);
  });

  it("leaves nothing of the case behind on success", () => {
    const state = run([
      { type: "delete_requested" },
      { type: "delete_submitting" },
      { type: "delete_succeeded" },
    ], onPlan);
    expect(state.screen).toBe("deleted");
    expect(state).toEqual({ ...initialState, screen: "deleted" });
    expect(state.caseId).toBeNull();
    expect(state.plan).toBeNull();
    expect(state.fields).toBeNull();
    expect(state.reminders).toBeNull();
    expect(state.confirmDelete).toBe(false);
  });

  it("treats an already-deleted case the same way (404)", () => {
    // The handler turns a 404 into the same action: gone is gone.
    const state = run([{ type: "delete_submitting" }, { type: "delete_succeeded" }], onPlan);
    expect(state).toEqual({ ...initialState, screen: "deleted" });
  });

  it("a 502 keeps the case and offers the retry", () => {
    const error = {
      message: "We could not finish deleting your case. Please try again.",
      code: "delete_incomplete",
    };
    const state = run([
      { type: "delete_requested" },
      { type: "delete_submitting" },
      { type: "delete_failed", error },
    ], onPlan);
    expect(state.screen).toBe("plan");
    expect(state.caseId).toBe(CASE_ID);
    expect(state.plan).toEqual(onPlan.plan);
    // The confirm stays open, so the button to try again is right there.
    expect(state.confirmDelete).toBe(true);
    expect(state.deleteUi).toEqual({ busy: false, error });
  });

  it("a retry after a 502 clears the last error", () => {
    const state = run([
      { type: "delete_requested" },
      { type: "delete_submitting" },
      { type: "delete_failed", error: { message: "x" } },
      { type: "delete_submitting" },
    ], onPlan);
    expect(state.deleteUi).toEqual({ busy: true, error: null });
  });

  it("starting again from the deleted screen goes back to welcome", () => {
    const deleted = run([
      { type: "delete_submitting" }, { type: "delete_succeeded" },
    ], onPlan);
    expect(reducer(deleted, { type: "restart" })).toEqual(initialState);
  });
});

describe("the privacy page", () => {
  it("comes back to the exact screen it was opened from", () => {
    const midFlow = run([
      { type: "uploaded", caseId: CASE_ID },
      { type: "extract_succeeded", fields: FIELDS },
      { type: "field_changed", key: "bank", value: "Sample Bank" },
    ]);
    const reading = reducer(midFlow, { type: "privacy_opened" });
    expect(reading.screen).toBe("privacy");
    expect(reading.returnTo).toBe("fields");

    const back = reducer(reading, { type: "privacy_closed" });
    expect(back.screen).toBe("fields");
    expect(back.returnTo).toBeNull();
    // Nothing typed is lost by reading the privacy page.
    expect(back.fields.bank).toBe("Sample Bank");
    expect(back.caseId).toBe(CASE_ID);
    expect(back).toEqual(midFlow);
  });

  it("works from every screen it is reachable from", () => {
    const states = {
      welcome: initialState,
      consent: run([{ type: "welcome_continued" }]),
      upload: run([
        { type: "welcome_continued" },
        { type: "consent_toggled", value: true }, { type: "consent_given" },
      ]),
      triage: run([
        { type: "extract_succeeded", fields: FIELDS }, { type: "fields_accepted" },
      ]),
      plan: reducer(initialState, { type: "plan_succeeded", plan: { path: "unauthorised" } }),
    };
    for (const [screen, state] of Object.entries(states)) {
      const reading = reducer(state, { type: "privacy_opened" });
      expect(reading.returnTo, screen).toBe(screen);
      expect(reducer(reading, { type: "privacy_closed" }), screen).toEqual(state);
    }
  });

  it("opening it from itself does not trap Back on the privacy page", () => {
    const reading = reducer(initialState, { type: "privacy_opened" });
    const again = reducer(reading, { type: "privacy_opened" });
    expect(again).toBe(reading);
    expect(again.returnTo).toBe("welcome");
    expect(reducer(again, { type: "privacy_closed" }).screen).toBe("welcome");
  });

  it("falls back to consent if there is somehow nowhere to return to", () => {
    const stranded = { ...initialState, screen: "privacy", returnTo: null };
    expect(reducer(stranded, { type: "privacy_closed" }).screen).toBe("consent");
  });
});

describe("unknown actions", () => {
  it("throws, because a bad dispatch is our bug", () => {
    expect(() => reducer(initialState, { type: "nope" })).toThrow(/Unknown action/);
    expect(() => reducer(initialState, {})).toThrow(/Unknown action/);
  });
});

describe("countFound", () => {
  it("counts only the eight, and only ones with a value", () => {
    expect(countFound(FIELDS)).toBe(7);           // payee_phone is null
    expect(countFound(null)).toBe(0);
    expect(countFound({})).toBe(0);
    expect(countFound({ ...FIELDS, bank: "   " })).toBe(6);
    expect(countFound({ ...FIELDS, payee_phone: "9876543210" })).toBe(8);
  });
});
