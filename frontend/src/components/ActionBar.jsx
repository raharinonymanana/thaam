/** The screen's primary action, and its optional secondary one, pinned to the
 * bottom of the card on a phone (D132).
 *
 * On a small screen the button a form ends in is otherwise a long scroll away,
 * and on the details screen that is eight fields down. Pinned, "Continue" is
 * always where the thumb already is. It sits inside the card rather than the
 * viewport so it scrolls away with the card on its way to the footer, and on a
 * desktop it is ordinary content at the end of the card.
 *
 * Put it inside the <form> when the primary button submits one.
 */
export default function ActionBar({ children }) {
  return <div className="action-bar">{children}</div>;
}
