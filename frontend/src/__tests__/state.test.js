import { describe, expect, it } from "vitest";
import {
  countFound, FIELD_KEYS, initialState, pickFields, planPayload, reducer,
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
  it("starts on consent with nothing given away", () => {
    expect(initialState.screen).toBe("consent");
    expect(initialState.consent).toBe(false);
    expect(initialState.caseId).toBeNull();
    expect(initialState.busy).toBe(false);
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
    const state = reducer(initialState, { type: "consent_given" });
    expect(state.screen).toBe("consent");
    expect(state).toBe(initialState);
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
