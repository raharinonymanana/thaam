import { describe, expect, it } from "vitest";
import {
  MESSAGES, normalisePhone, todayInIST, validateField, validateFields,
} from "../validate";

const TODAY = "2026-09-18";

const ok = (key, value, today = TODAY) => expect(validateField(key, value, today)).toBeNull();
const bad = (key, value, message, today = TODAY) =>
  expect(validateField(key, value, today)).toBe(message);

describe("todayInIST", () => {
  it("is India's date, not the browser's", () => {
    // 20:30 UTC is already the next day in Kolkata (+05:30).
    expect(todayInIST(new Date("2026-09-18T20:30:00Z"))).toBe("2026-09-19");
    expect(todayInIST(new Date("2026-09-18T18:29:00Z"))).toBe("2026-09-18");
    expect(todayInIST(new Date("2026-09-18T18:31:00Z"))).toBe("2026-09-19");
    expect(todayInIST(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01");
  });
});

describe("amount", () => {
  it("accepts rupees with up to two decimals", () => {
    for (const value of ["49999.00", "250", "0.5", "1234567.89", "1.0", " 250 "]) ok("amount", value);
  });

  it("is required and refuses anything that is not a plain number", () => {
    for (const value of ["", null, undefined, "49,999", "₹250", "1.234", "-5", "abc", "1e5", "."]) {
      bad("amount", value, MESSAGES.amount);
    }
  });
});

describe("txn_date", () => {
  it("accepts a real past or present date", () => {
    ok("txn_date", "2026-09-17");
    ok("txn_date", TODAY);
    ok("txn_date", "2020-02-29");
  });

  it("refuses a date in the future, measured in IST", () => {
    bad("txn_date", "2026-09-19", MESSAGES.txn_date_future);
    // Still 18 Sep in India, so tomorrow there really is the future.
    const today = todayInIST(new Date("2026-09-18T12:00:00Z"));
    bad("txn_date", "2026-09-19", MESSAGES.txn_date_future, today);
    // ...but once it is 19 Sep in India, the same date is fine.
    ok("txn_date", "2026-09-19", todayInIST(new Date("2026-09-18T20:30:00Z")));
  });

  it("is required and refuses a malformed or impossible date", () => {
    for (const value of ["", null, "17-09-2026", "2026-9-17", "2026-02-30", "2026-13-01", "today"]) {
      bad("txn_date", value, MESSAGES.txn_date);
    }
  });
});

describe("utr", () => {
  it("is optional", () => {
    ok("utr", "");
    ok("utr", null);
  });

  it("is exactly 12 digits when given", () => {
    ok("utr", "426173859012");
    for (const value of ["12345", "4261738590123", "42617385901", "4261 7385 9012", "abcdefghijkl"]) {
      bad("utr", value, MESSAGES.utr);
    }
  });
});

describe("txn_time", () => {
  it("is optional and accepts HH:MM or HH:MM:SS", () => {
    ok("txn_time", "");
    ok("txn_time", "10:41");
    ok("txn_time", "10:41:07");
    ok("txn_time", "00:00");
    ok("txn_time", "23:59:59");
  });

  it("refuses an impossible clock time", () => {
    for (const value of ["25:00", "10:60", "1:05", "10.41", "10:41:60", "noon"]) {
      bad("txn_time", value, MESSAGES.txn_time);
    }
  });
});

describe("account_masked", () => {
  it("is optional and takes XX plus up to four digits", () => {
    ok("account_masked", "");
    ok("account_masked", "XX1234");
    ok("account_masked", "XX4");
  });

  it("refuses a full account number", () => {
    for (const value of ["123456789012", "XX12345", "1234", "xx1234", "XX12A4", "XX"]) {
      bad("account_masked", value, MESSAGES.account_masked);
    }
    expect(MESSAGES.account_masked).toMatch(/Never enter your full account number/);
  });
});

describe("payee_phone", () => {
  it("is optional and accepts the ways a number is written", () => {
    for (const value of ["", "9876543210", "+91 98765-43210", "098765 43210",
      "919876543210", "(+91) 98765.43210"]) {
      ok("payee_phone", value);
    }
  });

  it("refuses anything that is not an Indian mobile", () => {
    for (const value of ["12345", "5876543210", "98765432101", "+91 5876543210", "98765 4321x"]) {
      bad("payee_phone", value, MESSAGES.payee_phone);
    }
  });

  it("normalises to ten digits", () => {
    expect(normalisePhone("+91 98765-43210")).toBe("9876543210");
    expect(normalisePhone("098765 43210")).toBe("9876543210");
    expect(normalisePhone("5876543210")).toBeNull();
  });
});

describe("payee_vpa and bank", () => {
  it("are optional and capped at 100 characters", () => {
    ok("payee_vpa", "");
    ok("payee_vpa", "refund.help99@okaxis");
    ok("bank", "State Bank of India");
    ok("bank", "x".repeat(100));
    bad("bank", "x".repeat(101), MESSAGES.bank);
    bad("payee_vpa", "x".repeat(101), MESSAGES.payee_vpa);
  });
});

describe("validateFields", () => {
  const GOOD = {
    amount: "49999.00",
    utr: "426173859012",
    txn_date: "2026-09-17",
    txn_time: "10:41:07",
    account_masked: "XX1234",
    payee_vpa: "refund.help99@okaxis",
    payee_phone: "",
    bank: "Sample Bank",
  };

  it("passes a complete, valid form", () => {
    const result = validateFields(GOOD, TODAY);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.focus).toBeNull();
  });

  it("passes with only the two required fields", () => {
    const result = validateFields({
      amount: "250", txn_date: "2026-09-17", utr: "", txn_time: "",
      account_masked: "", payee_vpa: "", payee_phone: "", bank: "",
    }, TODAY);
    expect(result.ok).toBe(true);
  });

  it("collects every bad field and focuses the first", () => {
    const result = validateFields({ ...GOOD, amount: "49,999", utr: "123" }, TODAY);
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(["amount", "utr"]);
    expect(result.focus).toBe("amount");
  });

  it("focuses the first bad field in the object's own order", () => {
    const result = validateFields({ ...GOOD, utr: "123" }, TODAY);
    expect(result.focus).toBe("utr");
  });
});
