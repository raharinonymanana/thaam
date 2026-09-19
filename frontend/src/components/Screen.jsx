import { useEffect, useRef } from "react";

// Whether any screen has finished mounting yet. The very first screen of a page
// load must not grab focus: nobody has navigated anywhere, and a focus ring
// around the heading on arrival looks like a bug. It is set on a timer rather
// than inside the effect because React StrictMode runs every mount effect
// twice in development, back to back - a flag flipped in the effect itself
// would let the second run focus the heading anyway.
let hasNavigated = false;

/** One screen of the flow.
 *
 * Focus moves to the heading whenever a screen appears after the first. Without
 * this, a screen reader and a keyboard both stay wherever the last button was,
 * so someone who cannot see the change is never told the app moved on - and the
 * app has no router, so nothing else announces it. On the first screen there is
 * nothing to announce, and a keyboard user simply starts at the top of the page.
 *
 * focusHeading is turned off when the screen has somewhere better to send the
 * cursor, such as the field the server has just rejected.
 */
export default function Screen({ title, icon, className, focusHeading = true, children }) {
  const heading = useRef(null);

  useEffect(() => {
    if (focusHeading && hasNavigated) heading.current?.focus();
    const mark = setTimeout(() => { hasNavigated = true; }, 0);
    return () => clearTimeout(mark);
    // Only on arrival: a later re-render must not yank focus out of an input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className={className ? `screen ${className}` : "screen"}>
      {icon ? (
        <div className="screen-head">
          <span className="screen-icon">{icon}</span>
          <h1 className="screen-title" ref={heading} tabIndex={-1}>{title}</h1>
        </div>
      ) : (
        <h1 className="screen-title" ref={heading} tabIndex={-1}>{title}</h1>
      )}
      {children}
    </section>
  );
}
