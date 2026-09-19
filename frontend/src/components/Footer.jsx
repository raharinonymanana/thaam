import { FOOTER_DISCLAIMERS } from "../disclaimers";
import Icon from "./Icon";

// What Thaam is and is not. The welcome screen used to list these three; they
// are here now, so they are said once, in the same place on every screen.
const PROMISES = [
  "Thaam never files anything for you. You stay in control.",
  "Not a bank, not the police, not the government.",
  "Delete your case any time, in one tap.",
];

/** One row at the foot of every screen: "About Thaam", closed. Opened, it holds
 * everything the person may want to check before trusting the app - what Thaam
 * does and does not do, the three disclaimers the backend also puts on every
 * plan, and the way to the privacy page - so the screens above it can be about
 * the step in front of them and nothing else.
 *
 * It is the last thing in the tab order on every screen, in the same place, so
 * it is found the same way everywhere (WCAG 3.2.6). The App remounts it on each
 * screen so it is always closed on arrival.
 */
export default function Footer({ onOpenPrivacy }) {
  return (
    <footer className="footer">
      <details className="fold about">
        <summary className="fold-summary about-summary">
          <Icon name="circle-alert" size={16} />
          <span>About Thaam</span>
          <Icon name="chevron-down" size={16} className="fold-chevron" />
        </summary>
        <div className="fold-body">
          <ul className="plain">
            {PROMISES.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <ul className="plain">
            {FOOTER_DISCLAIMERS.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <button
            type="button"
            className="linkish"
            onClick={(event) => {
              // Closed on the way out, so the privacy page does not open with
              // this still unfolded above it.
              event.currentTarget.closest("details").open = false;
              onOpenPrivacy();
            }}
          >
            How Thaam handles your data
          </button>
        </div>
      </details>
    </footer>
  );
}
