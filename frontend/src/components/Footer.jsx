// The same three lines the backend puts on every plan. They belong on every
// screen, not just the consent one: whichever screen a victim lands on, the
// limits of what Thaam is have to be visible there.
const DISCLAIMERS = [
  "Thaam is not a government service and is not affiliated with I4C, NCRP, RBI or any bank.",
  "This is guidance, not legal advice.",
  "Deadlines are estimated; act before the dates shown.",
];

export default function Footer() {
  return (
    <footer className="footer">
      <ul>
        {DISCLAIMERS.map((line) => <li key={line}>{line}</li>)}
      </ul>
    </footer>
  );
}
