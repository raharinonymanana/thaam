import { describe, expect, it } from "vitest";
import { countFound, FIELD_KEYS, initialState, reducer } from "../state";

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
    expect(state.fields.payee_phone).toBeNull();
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
    expect(Object.values(state.fields).every((value) => value === null)).toBe(true);
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
