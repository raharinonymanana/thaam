import ActionBar from "../components/ActionBar";
import Icon from "../components/Icon";
import Screen from "../components/Screen";

// The six sentences are the consent itself: what is stored, for how long, and
// what Thaam is not. They are unchanged - only the bullets became symbols.
const KEEP = [
  { icon: "file-text", text: "Your screenshot, to read the payment details. Deleted after 7 days." },
  { icon: "clock", text: "Those details and your action plan. Deleted after 90 days." },
];

const DOES_NOT = [
  { icon: "shield-check", text: "It never files a complaint for you. You stay in control of every step." },
  { icon: "scale", text: "It is not a government service, not the police and not your bank." },
  { icon: "scale", text: "It gives guidance, not legal advice." },
  { icon: "circle-alert", text: "It cannot tell you whether a message is a scam." },
];

function Rows({ items }) {
  return (
    <ul className="rows" role="list">
      {items.map((item) => (
        <li key={item.text} className="row">
          <Icon name={item.icon} size={20} />
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** What Thaam stores and what it is not - before anything is uploaded.
 *
 * Nothing on this screen calls the API: consent travels with the request that
 * creates the case, at the moment the screenshot is actually uploaded. The link
 * to the privacy page is not repeated here - it is in the footer, in the same
 * place on every screen.
 */
export default function Consent({ consent, onToggle, onContinue }) {
  return (
    <Screen title="Before we start">
      <p className="lead">
        Thaam helps you take the right steps in the first hours after an online
        payment fraud, in the order that matters.
      </p>

      <h2>What we keep</h2>
      <Rows items={KEEP} />

      <h2>What Thaam does not do</h2>
      <Rows items={DOES_NOT} />

      {/* id + htmlFor, not just nesting: with nesting alone a checkbox can end
          up announced as "on" (its default value) instead of the sentence
          beside it, which tells a screen-reader user nothing about what they
          are agreeing to. The whole bordered card is the tap target. */}
      <label className={`check${consent ? " check-on" : ""}`} htmlFor="consent-agree">
        <input
          id="consent-agree"
          type="checkbox"
          checked={consent}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <span>I agree to Thaam storing my screenshot and case details as described above.</span>
      </label>

      <ActionBar>
        <button
          type="button"
          className="button"
          onClick={onContinue}
          disabled={!consent}
        >
          Continue
        </button>
      </ActionBar>
    </Screen>
  );
}
