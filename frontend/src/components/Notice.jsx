/** An inline message. role="alert" only for errors, so a screen reader is not
 * interrupted by the calm informational ones. */
export function Notice({ kind = "info", children }) {
  return (
    <p className={`notice notice-${kind}`} role={kind === "error" ? "alert" : undefined}>
      {children}
    </p>
  );
}

/** An error with the one action that makes sense: try the same thing again. */
export function ErrorNotice({ error, onRetry, busy = false, label = "Try again" }) {
  if (!error) return null;
  return (
    <div className="error-box">
      <p className="notice notice-error" role="alert">{error.message}</p>
      {onRetry && (
        <button type="button" className="button button-quiet" onClick={onRetry} disabled={busy}>
          {label}
        </button>
      )}
    </div>
  );
}
