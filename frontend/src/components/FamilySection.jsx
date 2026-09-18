import { useState } from "react";
import { looksLikeEmail, sharesLine } from "../reminders";
import { ErrorNotice, Notice } from "./Notice";

const MAX_NAME = 60;

// What the helper actually receives. Said plainly, because handing a relative
// a link to the case would hand them the case's only credential - so we don't.
const SCOPE_NOTE =
  "They'll get ONE email with your steps and dates. No amount, account, UPI ID or link to your case.";

export default function FamilySection({ family, ui, onShare }) {
  const [email, setEmail] = useState("");
  const [toName, setToName] = useState("");

  const left = family.sendsRemaining;
  const ready = looksLikeEmail(email) && toName.length <= MAX_NAME && !ui.busy;

  return (
    <section className="card">
      <h2>Share with family</h2>

      {family.sent && <Notice kind="info">Sent to them ✓</Notice>}

      <p className="lead">{SCOPE_NOTE}</p>
      <p className="hint">{sharesLine(left)}</p>

      {left > 0 && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) onShare({ email: email.trim(), toName: toName.trim() });
          }}
        >
          <div className="field">
            <label className="field-label" htmlFor="family-name">
              Their name <span className="req">(optional)</span>
            </label>
            <input
              id="family-name"
              type="text"
              maxLength={MAX_NAME}
              autoComplete="off"
              value={toName}
              onChange={(event) => setToName(event.target.value)}
              disabled={ui.busy}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="family-email">Their email</label>
            <input
              id="family-email"
              type="email"
              autoComplete="off"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={ui.busy}
            />
          </div>

          <ErrorNotice error={ui.error} />

          <button type="submit" className="button" disabled={!ready} aria-busy={ui.busy}>
            {ui.busy ? "Sending…" : "Send to them"}
          </button>
        </form>
      )}

      {left === 0 && <ErrorNotice error={ui.error} />}
    </section>
  );
}
