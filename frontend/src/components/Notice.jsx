import Icon from "./Icon";

/** An inline message. role="alert" only for errors, so a screen reader is not
 * interrupted by the calm informational ones.
 *
 * Warn and error carry an icon as well as their colour, so the state is never
 * signalled by colour alone (D125). */
export function Notice({ kind = "info", children }) {
  return (
    <p className={`notice notice-${kind}`} role={kind === "error" ? "alert" : undefined}>
      {kind !== "info" && <Icon name="circle-alert" size={20} />}
      <span>{children}</span>
    </p>
  );
}

/** An error with the one action that makes sense: try the same thing again. */
export function ErrorNotice({ error, onRetry, busy = false, label = "Try again" }) {
  if (!error) return null;
  return (
    <div className="error-box">
      <p className="notice notice-error" role="alert">
        <Icon name="circle-alert" size={20} />
        <span>{error.message}</span>
      </p>
      {onRetry && (
        <button type="button" className="button button-quiet" onClick={onRetry} disabled={busy}>
          {label}
        </button>
      )}
    </div>
  );
}
