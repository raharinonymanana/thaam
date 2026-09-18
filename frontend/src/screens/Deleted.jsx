import Screen from "../components/Screen";

/** After a delete. The case ID is not shown, and by this point the app no
 * longer holds it: the state was reset and the fragment cleared. */
export default function Deleted({ onRestart }) {
  return (
    <Screen title="Your case is deleted">
      <p className="lead">
        Your screenshot, details, plan and reminders have been removed.
      </p>
      <button type="button" className="button" onClick={onRestart}>
        Start a new case
      </button>
    </Screen>
  );
}
