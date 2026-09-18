import { useEffect, useRef } from "react";
import Screen from "../components/Screen";
import { Notice } from "../components/Notice";
import { countFound, FIELD_KEYS, REQUIRED_KEYS } from "../state";

// Label and one-line hint for each of the eight. The hints say where to look
// on the screenshot, because that is what a victim is actually holding.
const FIELDS = {
  amount: {
    label: "Amount",
    hint: "The rupees that left your account, e.g. 49999.00",
    type: "text",
    inputMode: "decimal",
  },
  txn_date: {
    label: "Date of the payment",
    hint: "The day it happened",
    type: "date",
  },
  txn_time: {
    label: "Time of the payment",
    hint: "As shown in the message. Leave blank if it is not there.",
    type: "time",
    step: 1,
  },
  utr: {
    label: "UPI reference number (UTR)",
    hint: "Exactly 12 digits, sometimes called the transaction or reference ID",
    type: "text",
    inputMode: "numeric",
  },
  account_masked: {
    label: "Last 4 digits of your account",
    hint: "Only the last 4. Never enter your full account number.",
    type: "text",
    inputMode: "numeric",
    prefix: "XX",
  },
  bank: {
    label: "Your bank",
    hint: "The bank the money left, e.g. State Bank of India",
    type: "text",
  },
  payee_vpa: {
    label: "Who was paid — UPI ID",
    hint: "Looks like name@bank",
    type: "text",
  },
  payee_phone: {
    label: "Who was paid — mobile number",
    hint: "If the payment went to a phone number instead",
    type: "tel",
    inputMode: "numeric",
  },
};

// The order on screen: what the victim is most likely to find first.
const ORDER = ["amount", "txn_date", "txn_time", "utr",
  "account_masked", "bank", "payee_vpa", "payee_phone"];

function Field({ name, value, error, missing, inputRef, onChange }) {
  const spec = FIELDS[name];
  const required = REQUIRED_KEYS.includes(name);
  const errorId = error ? `${name}-error` : undefined;
  const hintId = `${name}-hint`;

  // Only the last four digits are ever typed, and the XX the backend expects is
  // added here, so a full account number cannot be sent even by pasting one.
  const shown = spec.prefix ? String(value ?? "").replace(/^XX/, "") : (value ?? "");

  function change(event) {
    const raw = event.target.value;
    if (!spec.prefix) return onChange(name, raw);
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    onChange(name, digits ? `XX${digits}` : "");
  }

  return (
    <div className={`field${error ? " field-bad" : ""}`}>
      <label className="field-label" htmlFor={name}>
        {spec.label}
        {required && <span className="req"> (needed)</span>}
      </label>
      <p className="hint" id={hintId}>{spec.hint}</p>

      <div className={spec.prefix ? "input-prefixed" : undefined}>
        {spec.prefix && <span className="prefix" aria-hidden="true">{spec.prefix}</span>}
        <input
          id={name}
          ref={inputRef}
          type={spec.type}
          inputMode={spec.inputMode}
          step={spec.step}
          maxLength={spec.prefix ? 4 : undefined}
          value={shown}
          onChange={change}
          autoComplete="off"
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ")}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
        />
      </div>

      {missing && !error && (
        <p className="missing">Not found — please type it if you can</p>
      )}
      {error && <p className="field-error" id={errorId} role="alert">{error}</p>}
    </div>
  );
}

export default function Fields({
  fields, fieldErrors, focusField, missingFields, unreadable, busy, onChange, onContinue,
}) {
  const inputs = useRef({});
  const found = countFound(fields);

  // After a rejected field - ours or the server's - put the cursor in it, so
  // the fix does not need hunting for on a small screen.
  useEffect(() => {
    if (!focusField) return;
    const input = inputs.current[focusField];
    input?.focus();
    input?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusField]);

  return (
    <Screen title="Check the details" focusHeading={!focusField}>
      {unreadable ? (
        <Notice kind="warn">
          We couldn&apos;t read this image — please type the details.
        </Notice>
      ) : (
        <p className="lead">
          <strong>{found} of {FIELD_KEYS.length} details found</strong> in your
          screenshot. Correct anything that is wrong, and fill in what you can.
        </p>
      )}

      <form
        noValidate
        onSubmit={(event) => { event.preventDefault(); onContinue(); }}
      >
        {ORDER.map((name) => (
          <Field
            key={name}
            name={name}
            value={fields?.[name] ?? ""}
            error={fieldErrors?.[name] ?? null}
            missing={missingFields?.includes(name) && !(fields?.[name] ?? "")}
            inputRef={(node) => { inputs.current[name] = node; }}
            onChange={onChange}
          />
        ))}

        <button type="submit" className="button" disabled={busy} aria-busy={busy}>
          Continue
        </button>
      </form>
    </Screen>
  );
}
