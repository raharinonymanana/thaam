import Screen from "../components/Screen";
import { ErrorNotice } from "../components/Notice";

export default function Extracting({ busy, error, onRetry }) {
  return (
    <Screen title="Reading your screenshot…">
      {busy && (
        <p className="lead" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          This takes a few seconds. Please keep this page open.
        </p>
      )}
      <ErrorNotice error={error} onRetry={onRetry} busy={busy} />
    </Screen>
  );
}
