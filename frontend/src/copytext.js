// The two things a victim has to write out themselves (D121), built here in
// the browser from the details they already confirmed. No backend call, and
// nothing in either text that Thaam has not been told by the victim.
//
// DELIBERATELY ABSENT: neither text names a category, a menu item or a form
// section on cybercrime.gov.in. We cannot see that portal and cannot verify
// what it currently calls anything, and sending a victim looking for a menu
// that has been renamed wastes the hours that matter most.

import { formatInr, formatLongDate } from "./format";
import { todayInIST } from "./validate";

const OPENING = {
  unauthorised:
    "An unauthorised UPI payment was debited from my account without my knowledge or approval.",
  authorised:
    "I was deceived into making a UPI payment to someone who turned out to be a fraudster.",
};

export const LETTER_SUBJECT =
  "Report of an unauthorised electronic transaction and request for reversal";

export const LETTER_DISCLAIMER = "This is a template, not legal advice.";

// The RBI circular the whole unauthorised path rests on. Named by date so a
// bank officer can look it up, and not paraphrased into a claim about what it
// entitles the victim to.
const RBI_CIRCULAR =
  "I am reporting it within the time set by the RBI circular of 6 July 2017 on "
  + "limiting customer liability in unauthorised electronic banking transactions.";

function dateAndTime(fields) {
  const date = formatLongDate(fields.txn_date);
  if (!date) return null;
  const time = (fields.txn_time || "").slice(0, 5);
  return time ? `${date}, ${time}` : date;
}

/** The labelled lines both texts share. A line with no value is left out
 * rather than printed empty: a blank beside a label reads as "none", and on a
 * complaint form that is a different claim from "I do not know". */
function detailLines(fields) {
  const amount = fields.amount ? formatInr(fields.amount) : "";
  return [
    ["Amount", amount ? `₹${amount}` : null],
    ["Date and time", dateAndTime(fields)],
    ["UTR / transaction reference", fields.utr],
    ["From account", fields.account_masked],
    ["Bank", fields.bank],
    ["Paid to UPI ID", fields.payee_vpa],
    ["Paid to mobile", fields.payee_phone],
  ]
    .filter(([, value]) => typeof value === "string" && value.trim() !== "")
    .map(([label, value]) => `${label}: ${value.trim()}`);
}

/** The block to paste into the incident description on cybercrime.gov.in. */
export function ncrpText(fields = {}, path = "unauthorised") {
  const opening = OPENING[path] ?? OPENING.unauthorised;
  return [opening, "", ...detailLines(fields)].join("\n");
}

/** The written complaint to the bank.
 *
 * UNAUTHORISED PATH ONLY. On the authorised path there is no liability cap to
 * claim and the victim did authorise the payment, so a letter saying otherwise
 * would be false - this returns null and the screen renders nothing.
 */
export function bankLetter(fields = {}, path = "unauthorised", today = todayInIST()) {
  if (path !== "unauthorised") return null;

  const bank = (fields.bank || "").trim() || "[your bank]";
  return [
    `To: The Branch Manager / Grievance Officer, ${bank}`,
    "",
    `Date: ${formatLongDate(today)}`,
    "",
    `Subject: ${LETTER_SUBJECT}`,
    "",
    "Sir / Madam,",
    "",
    `${OPENING.unauthorised} The details are:`,
    "",
    ...detailLines(fields),
    "",
    "I did not make or authorise this transaction and did not share my OTP, "
    + "UPI PIN or password.",
    "",
    RBI_CIRCULAR,
    "",
    "I request that you:",
    "1. Block the card, account or UPI channel used for this transaction.",
    "2. Investigate this transaction.",
    "3. Credit the amount back to my account (shadow credit) within 10 working "
    + "days, as the circular sets out.",
    "4. Acknowledge this complaint in writing, with the date and time you "
    + "received it.",
    "",
    "1930 / cybercrime.gov.in acknowledgement number: ________",
    "",
    "Name: ________  Mobile: ________  Signature: ________",
  ].join("\n");
}
