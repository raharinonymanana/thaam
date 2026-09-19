import Icon from "../components/Icon";
import Screen from "../components/Screen";

// The whole journey in three words each, so someone in a hurry sees where this
// is going before reading anything. Decoration for the eye, not controls: the
// cards do nothing when tapped, and the numbers are not read out because the
// list already numbers them.
const JOURNEY = [
  { icon: "phone", label: "Call 1930" },
  { icon: "image-plus", label: "Add your screenshot" },
  { icon: "circle-check", label: "Get your plan" },
];

/** The first thing anyone sees.
 *
 * Someone arriving here has just lost money, so the screen is one question, one
 * sentence, and the two things they can do: call, or start the plan. The call
 * is the only filled button - "Get my plan" is deliberately the quiet one, so
 * the call is never the second choice. What Thaam is and is not lives one tap
 * away in "About Thaam", in the same place on every screen.
 */
export default function Welcome({ onContinue }) {
  return (
    <Screen title="Lost money to a UPI fraud?" className="screen-welcome">
      <p className="lead">
        We&apos;ll guide you step by step: what to do right now, and the bank
        deadlines after.
      </p>

      <ol className="journey" role="list" aria-label="How it works">
        {JOURNEY.map((step, i) => (
          <li key={step.icon}>
            <span className="journey-icon">
              <Icon name={step.icon} size={20} />
              <span className="journey-num" aria-hidden="true">{i + 1}</span>
            </span>
            {step.label}
          </li>
        ))}
      </ol>

      <a className="button button-call" href="tel:1930">
        <Icon name="phone" size={22} />
        Call 1930 now
      </a>
      <p className="hint note">National cyber crime helpline · the first hour matters most</p>

      <button type="button" className="button button-quiet" onClick={onContinue}>
        Get my plan · 2 min
      </button>
    </Screen>
  );
}
