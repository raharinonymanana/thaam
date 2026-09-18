import Screen from "../components/Screen";
import PlanView from "../components/PlanView";
import { ErrorNotice, Notice } from "../components/Notice";

/** The screen a reminder email leads back to.
 *
 * The plan itself is rendered by the same component the post-/plan screen uses,
 * so a returning victim sees exactly what they saw the first time. Nothing here
 * prints the case ID, not even in an error: it is the credential for this case,
 * and this page can end up on a screen someone else is looking at.
 */
export default function Case({ busy, error, notFound, caseView, caseId, onRetry, onRestart }) {
  if (busy) {
    return (
      <Screen title="Opening your case…">
        <p className="lead" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          One moment.
        </p>
      </Screen>
    );
  }

  if (notFound) {
    return (
      <Screen title="Your case">
        <Notice kind="warn">This case has expired or does not exist.</Notice>
        <p className="lead">
          Thaam deletes every case after 90 days. You can start a new one now.
        </p>
        <button type="button" className="button" onClick={onRestart}>
          Start again
        </button>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="Your case">
        <ErrorNotice error={error} onRetry={onRetry} busy={busy} />
        <button type="button" className="button button-quiet" onClick={onRestart}>
          Start again
        </button>
      </Screen>
    );
  }

  return (
    <Screen title="Your plan">
      <p className="lead">Your case, as you left it.</p>
      <PlanView caseId={caseId} plan={caseView} />
    </Screen>
  );
}
