import Icon from "../components/Icon";
import Screen from "../components/Screen";

/** After a delete. The case ID is not shown, and by this point the app no
 * longer holds it: the state was reset and the fragment cleared. The last thing
 * someone sees of Thaam is a tick and a promise, not a form. */
export default function Deleted({ onRestart }) {
  return (
    <Screen title="Your case is deleted" icon={<Icon name="circle-check" size={40} />}>
      <p className="lead">
        Your screenshot, details, plan and reminders have been removed.
      </p>
      <p className="lead">If you ever need Thaam again, it&apos;s here.</p>
      <button type="button" className="button" onClick={onRestart}>
        Start a new case
      </button>
    </Screen>
  );
}
