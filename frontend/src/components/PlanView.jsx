import { useState } from "react";
import { ApiError, getAudio } from "../api";
import { deadlineRows, ESTIMATED_NOTE, goldenHourLine } from "../format";
import { Notice } from "./Notice";
import FamilySection from "./FamilySection";
import RemindersSection from "./RemindersSection";

// The plan, rendered once and used twice: straight after POST /plan, and again
// when a victim comes back to GET /cases/{id} from a reminder email. Both
// responses carry the same keys, so there is one component and no second copy
// of this wording to drift out of step.

const LANGUAGES = [
  { code: "en", label: "English", name: "EN" },
  { code: "hi", label: "हिन्दी", name: "हिन्दी" },
];

const AUDIO_FALLBACK =
  "Audio is unavailable right now. Please read the script on screen.";

function CallNow({ clocks }) {
  const line = goldenHourLine(clocks?.goldenHour);
  return (
    <section className="card call-now">
      <h2>Call 1930 now</h2>
      <a className="button button-call" href="tel:1930">Call 1930 now</a>
      {line && <p className="golden">{line}</p>}
      <p className="hint">
        1930 is the national cyber crime helpline. Read the script below to them.
      </p>
    </section>
  );
}

function Script({ caseId, script }) {
  const [lang, setLang] = useState("en");
  // Audio is view state, not flow state: the URL expires in minutes, so it is
  // fetched on the press and never carried around in the reducer.
  const [audio, setAudio] = useState({});
  const current = audio[lang] ?? {};

  async function listen() {
    setAudio((prev) => ({ ...prev, [lang]: { busy: true } }));
    try {
      const { url } = await getAudio(caseId, lang);
      setAudio((prev) => ({ ...prev, [lang]: { url } }));
    } catch (err) {
      const message = err instanceof ApiError && err.code === "audio_unavailable"
        ? err.message
        : AUDIO_FALLBACK;
      setAudio((prev) => ({ ...prev, [lang]: { error: message } }));
    }
  }

  return (
    <section className="card">
      <h2>Your call script</h2>

      <div className="tabs" role="tablist" aria-label="Script language">
        {LANGUAGES.map((option) => (
          <button
            key={option.code}
            type="button"
            role="tab"
            id={`tab-${option.code}`}
            aria-selected={lang === option.code}
            aria-controls={`panel-${option.code}`}
            className={`tab${lang === option.code ? " tab-on" : ""}`}
            onClick={() => setLang(option.code)}
          >
            {option.name}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`panel-${lang}`}
        aria-labelledby={`tab-${lang}`}
        tabIndex={0}
      >
        <p className="script" lang={lang}>{script?.[lang]}</p>

        <button
          type="button"
          className="button button-quiet"
          onClick={listen}
          disabled={current.busy}
          aria-busy={current.busy}
        >
          {current.busy ? "Preparing audio…" : `Listen (${LANGUAGES.find((l) => l.code === lang).label})`}
        </button>

        {current.url && (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- the caption is
          // the script printed above this player, in the same language.
          <audio className="player" controls autoPlay src={current.url}>
            Your browser cannot play audio. Please read the script above.
          </audio>
        )}
        {current.error && <Notice kind="warn">{current.error}</Notice>}
      </div>
    </section>
  );
}

function Deadlines({ clocks }) {
  const rows = deadlineRows(clocks);
  if (rows.length === 0) return null;
  return (
    <section className="card">
      <h2>Your deadlines</h2>
      <ul className="deadlines">
        {rows.map((row) => (
          <li key={row.id}>
            <p className="deadline-label">{row.label}</p>
            <p className="deadline-date">{row.date}</p>
            <p className="deadline-note">{ESTIMATED_NOTE}</p>
            {row.url && (
              <a href={row.url} target="_blank" rel="noopener noreferrer">
                Open the RBI complaint site
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Steps({ steps }) {
  if (!steps?.length) return null;
  return (
    <section className="card">
      <h2>Your steps</h2>
      <ol className="steps">
        {steps.map((step) => (
          <li key={step.id}>
            <p className="step-title">{step.title}</p>
            <p className="step-detail">{step.detail}</p>
            {step.tel && <a className="step-link" href={`tel:${step.tel}`}>Call {step.tel}</a>}
            {step.url && (
              <a className="step-link" href={step.url} target="_blank" rel="noopener noreferrer">
                Open {new URL(step.url).host}
              </a>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** D117: leaving is a deliberate act, and the confirm is inline rather than a
 * window.confirm - a native dialog blocks the page, reads as a browser warning
 * and cannot say the one thing that matters, which is that the current plan is
 * not being destroyed. */
function StartNewCase({ confirming, onRequest, onCancel, onConfirm }) {
  if (!confirming) {
    return (
      <p className="start-new">
        <button type="button" className="linkish" onClick={onRequest}>
          Start a new case
        </button>
      </p>
    );
  }
  return (
    <div className="start-new confirm" role="group" aria-label="Start a new case">
      <p>Start again? Your current plan stays at its link.</p>
      <button type="button" className="button" onClick={onConfirm}>Yes, start again</button>
      <button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button>
    </div>
  );
}

export default function PlanView({
  caseId, plan, reminders, remindersUi, family, familyUi, demoMode,
  confirmRestart, onEnrol, onShare, onRestartRequest, onRestartCancel, onRestart,
}) {
  if (!plan) return null;

  return (
    <div className="plan">
      <CallNow clocks={plan.clocks} />

      {plan.notSure && (
        <Notice kind="warn">
          You weren&apos;t sure, so Thaam used the path with the most protection.
          Report to your bank quickly either way.
        </Notice>
      )}

      <Script caseId={caseId} script={plan.script} />
      <Deadlines clocks={plan.clocks} />
      <Steps steps={plan.steps} />

      <section className="card">
        <h2>Keep this page</h2>
        <p>
          Bookmark this page to come back to your plan. Anyone with this link
          can see your case — don&apos;t share it.
        </p>
      </section>

      <RemindersSection
        reminders={reminders}
        ui={remindersUi}
        demoMode={demoMode}
        onEnrol={onEnrol}
      />

      <FamilySection family={family} ui={familyUi} onShare={onShare} />

      {plan.disclaimers?.length > 0 && (
        <ul className="plan-disclaimers">
          {plan.disclaimers.map((line) => <li key={line}>{line}</li>)}
        </ul>
      )}

      <StartNewCase
        confirming={confirmRestart}
        onRequest={onRestartRequest}
        onCancel={onRestartCancel}
        onConfirm={onRestart}
      />
    </div>
  );
}
