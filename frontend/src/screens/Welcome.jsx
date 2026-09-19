import ActionBar from "../components/ActionBar";
import Icon from "../components/Icon";
import Screen from "../components/Screen";

// Three facts about what Thaam is and is not, each with a symbol so they scan
// rather than read. The wording is the same promise the consent screen makes,
// shortened: nothing here is a claim the consent and privacy screens do not back.
const ROWS = [
  { icon: "shield-check", text: "Thaam never files anything for you. You stay in control." },
  { icon: "scale", text: "Not a bank, not the police, not the government." },
  { icon: "trash-2", text: "Delete your case any time, in one tap." },
];

/** The first thing anyone sees.
 *
 * Someone arriving here has just lost money, and the most useful thing on the
 * page is a phone number, so it comes before a single question is asked. It is
 * the only filled button on the screen: "Get my plan" is deliberately the
 * quiet one, so the call is never the second choice.
 */
export default function Welcome({ onContinue }) {
  return (
    <Screen title="Money left your account? We'll take this one step at a time.">
      <section className="card call-now">
        <p className="eyebrow">Do this first</p>
        <p className="hero-line">
          In the first hour, 1930 can sometimes freeze the money before it moves on.
        </p>
        <a className="button button-call" href="tel:1930">
          <Icon name="phone" size={22} />
          Call 1930 now
        </a>
      </section>

      <ul className="rows" role="list">
        {ROWS.map((row) => (
          <li key={row.icon} className="row">
            <Icon name={row.icon} size={20} />
            <span>{row.text}</span>
          </li>
        ))}
      </ul>

      <ActionBar>
        <button type="button" className="button button-quiet" onClick={onContinue}>
          Get my plan · about 2 minutes
        </button>
      </ActionBar>
    </Screen>
  );
}
