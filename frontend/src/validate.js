// Client-side copies of the backend's field rules.
//
// The server is the authority - it revalidates everything and its 400 wins.
// These exist so a victim is not made to wait for a round trip to be told the
// UTR is 11 digits, and so the wording they see is the same either way.

export const MAX_TEXT = 100;

const AMOUNT = /^\d+(\.\d{1,2})?$/;
const UTR = /^\d{12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
// Masked only. A full account number is refused here and never sent.
const ACCOUNT_MASKED = /^XX\d{1,4}$/;
const MOBILE = /^[6-9]\d{9}$/;
const PHONE_SEPARATORS = /[\s\-.()]/g;

export const MESSAGES = {
  amount: "Enter the amount as a number, e.g. 49999.00.",
  utr: "The UTR must be exactly 12 digits.",
  txn_date: "Enter the transaction date as YYYY-MM-DD.",
  txn_date_future: "The transaction date cannot be in the future.",
  txn_time: "Enter the time as HH:MM or HH:MM:SS.",
  account_masked:
    "Enter only the last 4 digits of the account. Never enter your full account number.",
  payee_phone: "Enter a 10-digit Indian mobile number, e.g. 98765 43210.",
  payee_vpa: `The UPI ID can be at most ${MAX_TEXT} characters.`,
  bank: `The bank name can be at most ${MAX_TEXT} characters.`,
};

/** Today in India, as YYYY-MM-DD.
 *
 * The transaction, the deadlines and the 1930 helpline are all on IST, and a
 * victim travelling or on a phone set to another timezone must not be told
 * their own transaction is in the future.
 */
export function todayInIST(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

/** '+91 98765-43210' -> '9876543210'. null if it is not an Indian mobile.
 * The server normalises too; this only decides whether to let it through. */
export function normalisePhone(value) {
  let digits = String(value ?? "").replace(PHONE_SEPARATORS, "");
  if (digits.startsWith("+91")) digits = digits.slice(3);
  else if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return MOBILE.test(digits) ? digits : null;
}

function isRealDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

/** The message for one field, or null when it is acceptable. */
export function validateField(key, rawValue, today = todayInIST()) {
  const value = typeof rawValue === "string" ? rawValue.trim() : "";

  switch (key) {
    case "amount":
      return AMOUNT.test(value) ? null : MESSAGES.amount;

    case "txn_date":
      if (!DATE.test(value) || !isRealDate(value)) return MESSAGES.txn_date;
      return value > today ? MESSAGES.txn_date_future : null;

    case "utr":
      if (!value) return null;
      return UTR.test(value) ? null : MESSAGES.utr;

    case "txn_time":
      if (!value) return null;
      return TIME.test(value) ? null : MESSAGES.txn_time;

    case "account_masked":
      if (!value) return null;
      return ACCOUNT_MASKED.test(value) ? null : MESSAGES.account_masked;

    case "payee_phone":
      if (!value) return null;
      return normalisePhone(value) ? null : MESSAGES.payee_phone;

    case "payee_vpa":
    case "bank":
      return value.length > MAX_TEXT ? MESSAGES[key] : null;

    default:
      return null;
  }
}

/** Every field's message, plus the first one to put the cursor in. */
export function validateFields(fields, today = todayInIST()) {
  const errors = {};
  for (const key of Object.keys(fields ?? {})) {
    const message = validateField(key, fields[key], today);
    if (message) errors[key] = message;
  }
  const focus = Object.keys(fields ?? {}).find((key) => errors[key]) ?? null;
  return { errors, focus, ok: focus === null };
}
