import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { Notice } from "./Notice";

const FEEDBACK_MS = 2000;

const FAILED =
  "We couldn't copy it. Select the text above and copy it yourself.";

/** A block of text the victim copies out, with a button that really copies.
 *
 * The textarea is read-only rather than a <pre>: it can be selected and copied
 * by hand on any phone, which is the fallback when the clipboard API is not
 * available - it needs a secure context, and an older browser may not have it
 * at all. "Copied" is only shown when a copy actually reported success;
 * claiming it falsely would send someone to paste an empty clipboard into a
 * government form.
 */
export default function CopyBox({ id, title, note, text, rows = 12 }) {
  const area = useRef(null);
  const timer = useRef(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    let ok = false;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      try {
        area.current?.focus();
        area.current?.select();
        ok = document.execCommand?.("copy") === true;
      } catch {
        ok = false;
      }
    }
    setCopied(ok);
    setFailed(!ok);
    clearTimeout(timer.current);
    if (ok) timer.current = setTimeout(() => setCopied(false), FEEDBACK_MS);
  }

  return (
    <section className="card">
      <h2>
        <label htmlFor={id}>{title}</label>
      </h2>
      {note && <p className="hint">{note}</p>}

      <textarea
        id={id}
        ref={area}
        className="copy-text"
        readOnly
        rows={rows}
        value={text}
      />

      <button type="button" className="button button-quiet" onClick={copy}>
        <Icon name={copied ? "check" : "copy"} size={20} />
        {copied ? "Copied" : "Copy"}
      </button>
      {/* Announced, so a screen-reader user hears the result of the press. */}
      <p className="copy-status" role="status">
        {copied ? "Copied to your clipboard." : ""}
      </p>
      {failed && !copied && <Notice kind="warn">{FAILED}</Notice>}
    </section>
  );
}
