import { useEffect, useRef } from "react";

/** One screen of the flow.
 *
 * Focus moves to the heading whenever a screen appears. Without this, a screen
 * reader and a keyboard both stay wherever the last button was, so someone who
 * cannot see the change is never told the app moved on - and the app has no
 * router, so nothing else announces it.
 */
export default function Screen({ title, children }) {
  const heading = useRef(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <section className="screen">
      <h1 className="screen-title" ref={heading} tabIndex={-1}>{title}</h1>
      {children}
    </section>
  );
}
