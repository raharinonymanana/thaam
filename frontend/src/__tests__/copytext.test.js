import { describe, expect, it } from "vitest";
import { bankLetter, LETTER_DISCLAIMER, LETTER_SUBJECT, ncrpText } from "../copytext";
import { FIELD_KEYS } from "../state";

const FIELDS = {
  amount: "49999.00",
  utr: "426173859012",
  txn_date: "2026-09-17",
  txn_time: "10:41:07",
  account_masked: "XX1234",
  payee_vpa: "refund.help99@okaxis",
  payee_phone: "",
  bank: "Sample Bank",
};

const TODAY = "2026-09-18";

// Keys extract also returns, which are not part of the eight the victim
// confirmed. The values are deliberately unlike any of our own wording.
const FOREIGN = { sender_id: "VK-SBIINB", direction: "QQdirectionQQ", lineCount: "424242" };

// Anything that would be a claim about the portal we cannot see, or a detail
// the victim never gave us.
const MUST_NOT_APPEAR = [
  "category", "Category", "sub-category", "menu", "Menu", "dropdown",
  "Financial Fraud", "Report Cyber Crime", "tab", "option",
];

describe("ncrpText", () => {
  it("opens by saying what happened, on the unauthorised path", () => {
    const text = ncrpText(FIELDS, "unauthorised");
    expect(text.split("\n")[0])
      .toBe("An unauthorised UPI payment was debited from my account without my "
        + "knowledge or approval.");
  });

  it("opens differently on the authorised path", () => {
    const text = ncrpText(FIELDS, "authorised");
    expect(text.split("\n")[0]).toMatch(/^I was deceived into making a UPI payment/);
    // It must not claim the payment was unauthorised: the victim said it was.
    expect(text).not.toMatch(/unauthorised/i);
    expect(text).not.toMatch(/did not (make|approve|authorise)/i);
  });

  it("lists every detail it was given, labelled", () => {
    const text = ncrpText(FIELDS, "unauthorised");
    expect(text).toContain("Amount: ₹49,999.00");
    expect(text).toContain("Date and time: 17 September 2026, 10:41");
    expect(text).toContain("UTR / transaction reference: 426173859012");
    expect(text).toContain("From account: XX1234");
    expect(text).toContain("Bank: Sample Bank");
    expect(text).toContain("Paid to UPI ID: refund.help99@okaxis");
  });

  it("leaves out a line it has no value for", () => {
    const text = ncrpText(FIELDS, "unauthorised");
    // payee_phone is empty in the fixture.
    expect(text).not.toContain("Paid to mobile");
    expect(text).not.toMatch(/:\s*$/m);
  });

  it("keeps a line that does have a value", () => {
    const text = ncrpText({ ...FIELDS, payee_phone: "9876543210" }, "unauthorised");
    expect(text).toContain("Paid to mobile: 9876543210");
  });

  it("drops the time but keeps the date when the time is unknown", () => {
    const text = ncrpText({ ...FIELDS, txn_time: "" }, "unauthorised");
    expect(text).toContain("Date and time: 17 September 2026");
    expect(text).not.toContain("10:41");
  });

  it("survives a case with only the two required details", () => {
    const text = ncrpText({ amount: "250", txn_date: "2026-09-17" }, "unauthorised");
    expect(text).toContain("Amount: ₹250.00");
    expect(text).toContain("Date and time: 17 September 2026");
    for (const label of ["UTR", "From account", "Bank:", "Paid to"]) {
      expect(text).not.toContain(label);
    }
  });

  it("never names a portal category or menu item", () => {
    for (const path of ["unauthorised", "authorised"]) {
      const text = ncrpText(FIELDS, path);
      for (const word of MUST_NOT_APPEAR) expect(text).not.toContain(word);
    }
  });

  it("carries nothing beyond the confirmed details", () => {
    // Distinctive values: "debit" itself is a substring of our own "debited".
    const text = ncrpText({ ...FIELDS, ...FOREIGN }, "unauthorised");
    for (const value of Object.values(FOREIGN)) expect(text).not.toContain(value);
    for (const key of Object.keys(FOREIGN)) expect(text).not.toContain(key);
  });

  it("defaults to the path with the most protection", () => {
    expect(ncrpText(FIELDS)).toBe(ncrpText(FIELDS, "unauthorised"));
    expect(ncrpText(FIELDS, "something_else")).toBe(ncrpText(FIELDS, "unauthorised"));
  });
});

describe("bankLetter", () => {
  const letter = bankLetter(FIELDS, "unauthorised", TODAY);

  it("is never produced on the authorised path", () => {
    expect(bankLetter(FIELDS, "authorised", TODAY)).toBeNull();
    expect(bankLetter(FIELDS, "authorised")).toBeNull();
  });

  it("is addressed, dated and titled", () => {
    expect(letter).toContain("To: The Branch Manager / Grievance Officer, Sample Bank");
    expect(letter).toContain("Date: 18 September 2026");
    expect(letter).toContain(`Subject: ${LETTER_SUBJECT}`);
    expect(LETTER_SUBJECT)
      .toBe("Report of an unauthorised electronic transaction and request for reversal");
  });

  it("uses a placeholder when the bank is not known", () => {
    const text = bankLetter({ ...FIELDS, bank: "" }, "unauthorised", TODAY);
    expect(text).toContain("To: The Branch Manager / Grievance Officer, [your bank]");
    expect(text).not.toContain("Bank:");
  });

  it("carries the same transaction details", () => {
    expect(letter).toContain("Amount: ₹49,999.00");
    expect(letter).toContain("Date and time: 17 September 2026, 10:41");
    expect(letter).toContain("UTR / transaction reference: 426173859012");
    expect(letter).toContain("From account: XX1234");
  });

  it("states the denial and cites the circular by date", () => {
    expect(letter).toContain(
      "I did not make or authorise this transaction and did not share my OTP, "
      + "UPI PIN or password.");
    expect(letter).toContain("RBI circular of 6 July 2017");
    expect(letter).toContain("limiting customer liability in unauthorised electronic "
      + "banking transactions");
  });

  it("makes the four requests", () => {
    expect(letter).toMatch(/1\. Block the card, account or UPI channel/);
    expect(letter).toMatch(/2\. Investigate this transaction\./);
    expect(letter).toMatch(/3\. Credit the amount back to my account \(shadow credit\) within 10 working days/);
    expect(letter).toMatch(/4\. Acknowledge this complaint in writing, with the date and time/);
  });

  it("leaves room for the things only the victim can fill in", () => {
    expect(letter).toContain("1930 / cybercrime.gov.in acknowledgement number: ________");
    expect(letter).toContain("Name: ________  Mobile: ________  Signature: ________");
  });

  it("says it is a template", () => {
    expect(LETTER_DISCLAIMER).toBe("This is a template, not legal advice.");
  });

  it("never names a portal category, or a detail it was not given", () => {
    for (const word of MUST_NOT_APPEAR) expect(letter).not.toContain(word);
    expect(bankLetter({ ...FIELDS, sender_id: "VK-SBIINB" }, "unauthorised", TODAY))
      .not.toContain("VK-SBIINB");
  });

  it("only ever contains the eight confirmed details", () => {
    const text = bankLetter({ ...FIELDS, ...FOREIGN }, "unauthorised", TODAY);
    for (const value of Object.values(FOREIGN)) expect(text).not.toContain(value);
    for (const key of Object.keys(FOREIGN)) expect(text).not.toContain(key);
  });

  it("is built only from keys the victim confirmed", () => {
    // Drop each of the eight in turn: nothing else may go missing with it.
    for (const key of FIELD_KEYS) {
      const text = bankLetter({ ...FIELDS, [key]: "" }, "unauthorised", TODAY);
      expect(text, key).toContain("Sir / Madam,");
      expect(text, key).toContain("RBI circular of 6 July 2017");
    }
  });
});
