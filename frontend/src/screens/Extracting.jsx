import { useEffect, useState } from "react";
import Screen from "../components/Screen";
import { ErrorNotice } from "../components/Notice";
import { READING_STAGES as STAGES } from "../reading";

/** Its own component so the clock starts when the wait starts and resets by
 * itself when it ends: a retry after an error mounts a fresh one at stage 0. */
function Progress() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timers = STAGES.slice(1).map((next, i) =>
      setTimeout(() => setStage(i + 1), next.after));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <>
      <p className="lead" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        {STAGES[stage].text}
      </p>
      {/* Three field-shaped blocks: the details screen is what is coming, so
          the page holds the shape of it instead of a blank card. Decoration
          only - the sentence above is what a screen reader hears. */}
      <div className="skeleton" aria-hidden="true">
        {[0, 1, 2].map((n) => (
          <div key={n} className="skeleton-field">
            <span className="skeleton-label" />
            <span className="skeleton-input" />
          </div>
        ))}
      </div>
    </>
  );
}

export default function Extracting({ busy, error, onRetry }) {
  return (
    <Screen title="Reading your screenshot…">
      {busy && <Progress />}
      <ErrorNotice error={error} onRetry={onRetry} busy={busy} />
    </Screen>
  );
}
