import Screen from "../components/Screen";
import { Notice } from "../components/Notice";
import { countFound, FIELD_KEYS } from "../state";

/** STUB - task 4c builds the editable form here.
 *
 * No field VALUE is rendered yet, deliberately: the next task owns how each one
 * is labelled, corrected and masked, and showing them raw in the meantime would
 * put an unmasked account number on screen.
 */
export default function Fields({ fields, unreadable }) {
  const found = countFound(fields);

  return (
    <Screen title="Check the details">
      {unreadable && (
        <Notice kind="warn">
          We couldn&apos;t read this image — please type the details.
        </Notice>
      )}

      <p className="lead">
        <strong>{found} of {FIELD_KEYS.length} details found</strong> in your screenshot.
      </p>

      <Notice kind="info">
        Coming next: the form where you check and correct these details, then
        answer one question so Thaam can build your plan.
      </Notice>
    </Screen>
  );
}
