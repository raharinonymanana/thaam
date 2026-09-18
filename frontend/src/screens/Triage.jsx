import Screen from "../components/Screen";
import { ErrorNotice } from "../components/Notice";

// D116: the exact wording. The question decides which RBI deadlines apply, so
// it is asked once, plainly, with no word that could read as blame - a victim
// who feels accused answers to protect themselves, and a wrong answer here
// costs them the liability cap.
const OPTIONS = [
  { value: "yes", label: "Yes — I approved it or shared a code" },
  { value: "no", label: "No — it happened without me" },
  { value: "not_sure", label: "I'm not sure" },
];

export default function Triage({ shared, busy, error, onAnswer, onSubmit, onBack }) {
  return (
    <Screen title="One question">
      <p className="lead question">
        Did you approve this payment yourself, or share an OTP, UPI PIN or
        password with anyone before it happened?
      </p>

      <fieldset className="options">
        <legend className="sr-only">Your answer</legend>
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`option${shared === option.value ? " option-on" : ""}`}
          >
            <input
              type="radio"
              name="sharedCredentials"
              value={option.value}
              checked={shared === option.value}
              onChange={() => onAnswer(option.value)}
              disabled={busy}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>

      <p className="hint reassure">
        Either answer is fine. Scammers are very good at tricking people. Your
        answer only changes which deadlines apply.
      </p>

      <ErrorNotice error={error} onRetry={onSubmit} busy={busy} />

      <button
        type="button"
        className="button"
        onClick={onSubmit}
        disabled={busy || !shared}
        aria-busy={busy}
      >
        {busy ? "Building your plan…" : "Build my plan"}
      </button>

      <button type="button" className="button button-quiet" onClick={onBack} disabled={busy}>
        Back to the details
      </button>
    </Screen>
  );
}
