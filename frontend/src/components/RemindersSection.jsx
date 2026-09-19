import { useState } from "react";
import { formatIstDate } from "../format";
import { formatDemoFire } from "../planview";
import { isEnrolled, looksLikeEmail, stepLabel, stepStatus } from "../reminders";
import { ErrorNotice, Notice } from "./Notice";

// D118: this build runs in the SES sandbox, so mail only reaches addresses
// that have been approved out of band. Saying so up front is the difference
// between "it is broken" and "it is a preview".
const PREVIEW_NOTE =
  "Preview version: emails can only be delivered to addresses approved for this demo.";

const PRIVACY_NOTE =
  "Reminder emails never contain your amount, account, UPI ID or bank name.";

function StepList({ reminders }) {
  // Demo reminders fire within minutes, so a date says nothing: show the time.
  const format = reminders.demo ? (iso) => formatDemoFire(iso) : formatIstDate;
  return (
    <ul className="reminder-steps">
      {reminders.steps.map((entry) => {
        const status = stepStatus(entry, format);
        return (
          <li key={entry.step}>
            <p className="reminder-label">{stepLabel(entry.step)}</p>
            <p className={`reminder-status reminder-${status.tone}`}>{status.text}</p>
          </li>
        );
      })}
    </ul>
  );
}

export default function RemindersSection({ reminders, ui, demoMode, onEnrol }) {
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [demo, setDemo] = useState(false);

  if (isEnrolled(reminders)) {
    return (
      <section className="card">
        <h2>Reminders</h2>
        <p className="lead"><strong>Reminders are on.</strong></p>
        {reminders.demo && <p className="hint">Demo timing: all of these arrive within minutes.</p>}
        <StepList reminders={reminders} />
        <p className="hint">
          Every reminder has a link to stop them. {PRIVACY_NOTE}
        </p>
        {/* Same rule as the family section: the last attempt's result is the
            only one on screen, so a failure is never hidden behind the list
            it failed to change. */}
        <ErrorNotice error={ui.error} />
      </section>
    );
  }

  const ready = agreed && looksLikeEmail(email) && !ui.busy;

  return (
    <section className="card">
      <h2>Reminders</h2>
      {reminders?.status === "cancelled" && (
        <Notice kind="info">You stopped these reminders. You can turn them back on.</Notice>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) onEnrol({ email: email.trim(), demo });
        }}
      >
        <div className="field">
          <label className="field-label" htmlFor="reminder-email">Your email</label>
          <input
            id="reminder-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={ui.busy}
            aria-describedby="reminder-privacy"
          />
        </div>

        {/* id + htmlFor, not just nesting: without it both of these are
            announced as "on" rather than the sentence beside them. */}
        <label className="check" htmlFor="reminder-agree">
          <input
            id="reminder-agree"
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            disabled={ui.busy}
          />
          <span>
            Email me before each deadline, for up to 90 days. Every email has a
            link to stop them.
          </span>
        </label>

        {demoMode && (
          <label className="check" htmlFor="reminder-demo">
            <input
              id="reminder-demo"
              type="checkbox"
              checked={demo}
              onChange={(event) => setDemo(event.target.checked)}
              disabled={ui.busy}
            />
            <span>Demo timing — send all reminders within 5 minutes</span>
          </label>
        )}

        <p className="hint" id="reminder-privacy">{PRIVACY_NOTE}</p>
        <p className="hint">{PREVIEW_NOTE}</p>

        <ErrorNotice error={ui.error} />

        <button type="submit" className="button" disabled={!ready} aria-busy={ui.busy}>
          {ui.busy ? "Turning them on…" : "Turn on reminders"}
        </button>
      </form>
    </section>
  );
}
