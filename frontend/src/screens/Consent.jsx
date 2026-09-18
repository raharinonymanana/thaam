import Screen from "../components/Screen";

/** What Thaam stores and what it is not - before anything is uploaded.
 *
 * Nothing on this screen calls the API: consent travels with the request that
 * creates the case, at the moment the screenshot is actually uploaded.
 */
export default function Consent({ consent, onToggle, onContinue }) {
  return (
    <Screen title="Before we start">
      <p className="lead">
        Thaam helps you take the right steps in the first hours after an online
        payment fraud, in the order that matters.
      </p>

      <h2>What we keep</h2>
      <ul className="plain">
        <li>Your screenshot, to read the payment details. Deleted after 7 days.</li>
        <li>Those details and your action plan. Deleted after 90 days.</li>
      </ul>

      <h2>What Thaam does not do</h2>
      <ul className="plain">
        <li>It never files a complaint for you. You stay in control of every step.</li>
        <li>It is not a government service, not the police and not your bank.</li>
        <li>It gives guidance, not legal advice.</li>
        <li>It cannot tell you whether a message is a scam.</li>
      </ul>

      <label className="check">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <span>I agree to Thaam storing my screenshot and case details as described above.</span>
      </label>

      <button
        type="button"
        className="button"
        onClick={onContinue}
        disabled={!consent}
      >
        Continue
      </button>
    </Screen>
  );
}
