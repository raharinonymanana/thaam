import { useEffect, useState } from "react";
import Icon from "./Icon";
import { summaryPills } from "../planview";
import { scrollToId } from "../scrollTo";

/** The moment a fresh plan arrives: a banner that says so, draws its own tick,
 * and folds away after four seconds. Never shown on a reopened case - someone
 * coming back from a reminder email has not just built anything.
 *
 * It stays in the page once folded, hidden, rather than being removed: taking
 * a live region out mid-announcement can cut the announcement off. */
export function PlanReady() {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setGone(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`plan-ready${gone ? " plan-ready-gone" : ""}`} role="status">
      <Icon name="circle-check" size={22} draw />
      <span>Your plan is ready</span>
    </div>
  );
}

/** The payment this plan is about, in three pills: enough to see at a glance
 * that it is the right case. A pill with nothing to show is left out. */
export function Summary({ fields }) {
  const pills = summaryPills(fields);
  if (pills.length === 0) return null;
  return (
    <ul className="pills" role="list" aria-label="This case">
      {pills.map((pill) => <li key={pill.id} className="pill">{pill.text}</li>)}
    </ul>
  );
}

export function Progress({ done, total }) {
  if (!total) return null;
  return (
    <div className="progress-block">
      <p className="progress-text">
        {done === total ? "All steps done. Keep this page for the dates below." : `${done} of ${total} done`}
      </p>
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label="Checklist progress"
      >
        <span className="progress-fill" style={{ width: `${(done / total) * 100}%` }} />
      </div>
    </div>
  );
}

/** Four pills that jump to a part of the page, on a phone only. Real links, so
 * they read as links - but they scroll instead of navigating (see scrollTo.js),
 * because a change to the address would take the case link with it. */
export function JumpBar({ targets, onJump }) {
  return (
    <nav className="jump-bar" aria-label="Jump to a section">
      {targets.map((target) => (
        <a
          key={target.id}
          className="jump-pill"
          href={`#${target.id}`}
          onClick={(event) => {
            event.preventDefault();
            onJump?.(target.id);
            scrollToId(target.id);
          }}
        >
          {target.label}
        </a>
      ))}
    </nav>
  );
}
