import Icon from "./Icon";

/** A native <details> as a card: closed until asked for, so the plan page is
 * the things to do and the things to know, with the paperwork one tap away.
 *
 * Controlled from outside because other things open it - the checklist's
 * "Copy complaint text" and the jump bar's "More". The browser's own toggling
 * (a tap, the keyboard) is reported back through onToggle so the two agree.
 * The body is always rendered, only hidden: a closed fold still has its inputs
 * in the page, which is what lets a label find them. Without an onToggle it is
 * an ordinary uncontrolled fold, opened and closed by the browser alone.
 */
export default function Fold({ id, icon, title, open, onToggle, children }) {
  return (
    <details
      id={id}
      className="fold card"
      open={open}
      onToggle={onToggle && ((event) => onToggle(event.currentTarget.open))}
    >
      <summary className="fold-summary">
        <Icon name={icon} size={20} />
        <span className="fold-title">{title}</span>
        <Icon name="chevron-down" size={20} className="fold-chevron" />
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}
