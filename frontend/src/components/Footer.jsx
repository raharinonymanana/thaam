import { FOOTER_DISCLAIMERS } from "../disclaimers";

// The same three lines the backend puts on every plan. They belong on every
// screen, not just the consent one: whichever screen a victim lands on, the
// limits of what Thaam is have to be visible there.

export default function Footer({ onOpenPrivacy }) {
  return (
    <footer className="footer">
      <ul>
        {FOOTER_DISCLAIMERS.map((line) => <li key={line}>{line}</li>)}
      </ul>
      <p>
        <button type="button" className="linkish" onClick={onOpenPrivacy}>
          How Thaam handles your data
        </button>
      </p>
    </footer>
  );
}
