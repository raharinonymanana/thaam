import { useEffect, useRef, useState } from "react";
import ActionBar from "../components/ActionBar";
import Icon from "../components/Icon";
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

// The order on screen: what the victim is most likely to find first, in two
// cards. The order inside is exactly the order it was before the cards.
const GROUPS = [
  { id: "payment", title: "Payment", keys: ["amount", "txn_date", "txn_time", "utr"] },
  { id: "accounts", title: "Accounts",
    keys: ["account_masked", "bank", "payee_vpa", "payee_phone"] },
];

// The two ways a payee is named. Either one satisfies the other.
const ALTERNATIVES = { payee_vpa: "payee_phone", payee_phone: "payee_vpa" };

/** The screenshot, small, at the top: the victim is copying eight values off
 * it, and having it beside the form saves them switching apps. Tapping opens it
 * full width in place - an expander, not a modal, so nothing traps focus and
 * the form is one scroll away. Object URLs pin the decoded image in memory, so
 * it is revoked when this goes. */
function Compare({ file }) {
  const [url, setUrl] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!file) return undefined;
    const made = URL.createObjectURL(file);
    // An object URL is an external resource: it has to be made here so the
    // cleanup below can revoke exactly this one, including under StrictMode's
    // mount-unmount-mount, where a URL made during render would be revoked and
    // then reused.
    // eslint-disable-next-line react/set-state-in-effect
    setUrl(made);
    return () => { URL.revokeObjectURL(made); setUrl(null); };
  }, [file]);

  if (!file || !url) return null;
  return (
    <div className="compare">
      <button
        type="button"
        className="compare-toggle"
        aria-expanded={open}
        aria-controls="compare-panel"
        onClick={() => setOpen((was) => !was)}
      >
        <img className="compare-thumb" src={url} alt="" />
        <span>Tap to compare</span>
        <Icon name="chevron-down" size={20} className={open ? "chevron chevron-open" : "chevron"} />
      </button>
      {open && (
        <img
          id="compare-panel"
          className="compare-full"
          src={url}
          alt="Your screenshot, full size"
        />
      )}
    </div>
  );
}

function Field({ name, value, error, missing, found, inputRef, onChange }) {
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
      <div className="field-head">
        <label className="field-label" htmlFor={name}>
          {spec.label}
          {required && <span className="req"> (needed)</span>}
        </label>
        {/* Colour is never the only signal: each pill says its state in words.
            "Needs you" is hidden from screen readers because the sentence
            below carries the same meaning for them. */}
        {found && (
          <span className="badge badge-found">
            <Icon name="check" size={12} />
            Found
          </span>
        )}
        {missing && <span className="badge badge-needs" aria-hidden="true">Needs you</span>}
      </div>
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
        <p className="sr-only">Not found — please type it if you can</p>
      )}
      {error && <p className="field-error" id={errorId} role="alert">{error}</p>}
    </div>
  );
}

export default function Fields({
  file = null, fields, fieldErrors, focusField, missingFields, unreadable, busy,
  onChange, onContinue,
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

      <Compare file={file} />

      <form
        noValidate
        onSubmit={(event) => { event.preventDefault(); onContinue(); }}
      >
        {GROUPS.map((group) => (
          <section key={group.id} className="group" aria-labelledby={`group-${group.id}`}>
            <h2 className="group-title" id={`group-${group.id}`}>{group.title}</h2>
            {group.keys.map((name) => {
              const value = fields?.[name] ?? "";
              const gone = missingFields?.includes(name);
              // A payment goes to a UPI ID or to a phone number, not both: if
              // one of the two is filled in, the other is not missing, it is
              // simply not what happened.
              const other = ALTERNATIVES[name];
              const covered = other !== undefined && (fields?.[other] ?? "") !== "";
              return (
                <Field
                  key={name}
                  name={name}
                  value={value}
                  error={fieldErrors?.[name] ?? null}
                  missing={gone && !value && !covered}
                  found={!gone && value !== ""}
                  inputRef={(node) => { inputs.current[name] = node; }}
                  onChange={onChange}
                />
              );
            })}
          </section>
        ))}

        <ActionBar>
          <button type="submit" className="button" disabled={busy} aria-busy={busy}>
            Continue
          </button>
        </ActionBar>
      </form>
    </Screen>
  );
}
