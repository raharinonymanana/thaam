import { useEffect, useState } from "react";
import { bankLetter, LETTER_DISCLAIMER, ncrpText } from "../copytext";
import {
  extraDisclaimers, loadTicks, progressOf, saveTicks, ticksKey, timelineRows,
} from "../planview";
import { scrollBehavior } from "../scrollTo";
import Checklist from "./Checklist";
import CopyBox from "./CopyBox";
import FamilySection from "./FamilySection";
import Fold from "./Fold";
import Icon from "./Icon";
import { ErrorNotice, Notice } from "./Notice";
import NowHero from "./NowHero";
import { JumpBar, PlanReady, Progress, Summary } from "./PlanTop";
import RemindersSection from "./RemindersSection";
import Timeline from "./Timeline";

// The plan, rendered once and used twice: straight after POST /plan, and again
// when a victim comes back to GET /cases/{id} from a reminder email. Both
// responses carry the same keys, so there is one component and no second copy
// of this wording to drift out of step. `reopened` is the only difference: a
// fresh plan announces itself, a returning one does not.

/** D121: the two documents the victim has to produce, built here from the
 * details they confirmed. The letter is unauthorised-only - on the authorised
 * path bankLetter returns null and nothing is rendered, because there is no
 * unauthorised transaction to report and no liability cap to claim. */
function Documents({ fields, path, letter }) {
  return (
    <>
      <CopyBox
        id="copy-ncrp"
        title="Text for cybercrime.gov.in"
        note="Paste this into the description box when you file your complaint."
        text={ncrpText(fields, path)}
        rows={10}
      />
      {letter && (
        <CopyBox
          id="copy-letter"
          title="Letter to your bank"
          note={LETTER_DISCLAIMER}
          text={letter}
          rows={18}
        />
      )}
    </>
  );
}

/** D120: the victim does not have to wait 90 days. The confirm is inline and
 * says plainly what goes, because this one really cannot be undone. */
function DeleteCase({ confirming, ui, onRequest, onCancel, onConfirm }) {
  return (
    <section className="card danger">
      <h2>Delete my case now</h2>
      {!confirming ? (
        <>
          <p className="hint">
            Removes your screenshot, your plan and your reminders straight away.
          </p>
          <button type="button" className="button button-quiet" onClick={onRequest}>
            Delete my case now
          </button>
        </>
      ) : (
        <>
          <p>
            This deletes your screenshot, your plan and your reminders right
            now. It cannot be undone.
          </p>
          <ErrorNotice error={ui.error} />
          <button
            type="button"
            className="button button-danger"
            onClick={onConfirm}
            disabled={ui.busy}
            aria-busy={ui.busy}
          >
            <Icon name="trash-2" size={20} />
            {ui.busy ? "Deleting…" : "Yes, delete everything"}
          </button>
          <button
            type="button"
            className="button button-quiet"
            onClick={onCancel}
            disabled={ui.busy}
          >
            Cancel
          </button>
        </>
      )}
    </section>
  );
}

/** D117: leaving is a deliberate act, and the confirm is inline rather than a
 * window.confirm - a native dialog blocks the page, reads as a browser warning
 * and cannot say the one thing that matters, which is that the current plan is
 * not being destroyed. */
function StartNewCase({ confirming, onRequest, onCancel, onConfirm }) {
  if (!confirming) {
    return (
      <p className="start-new">
        <button type="button" className="linkish" onClick={onRequest}>
          Start a new case
        </button>
      </p>
    );
  }
  return (
    <div className="start-new confirm" role="group" aria-label="Start a new case">
      <p>Start again? Your current plan stays at its link.</p>
      <button type="button" className="button" onClick={onConfirm}>Yes, start again</button>
      <button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button>
    </div>
  );
}

export default function PlanView({
  caseId, plan, fields, reminders, remindersUi, family, familyUi, demoMode,
  confirmRestart, confirmDelete, deleteUi, reopened = false, now,
  onEnrol, onShare, onRestartRequest, onRestartCancel, onRestart,
  onDeleteRequest, onDeleteCancel, onDelete,
}) {
  // Which steps are ticked lives here, not in the reducer: it is a private
  // note-to-self kept on this phone (D126), and never part of the case. It is
  // stored under a hash of the case ID (D136), which takes a moment to work out
  // and may not be possible at all (no secure context): until the key arrives,
  // and for good when it is null, ticks live in memory for this visit only.
  const [ticks, setTicks] = useState([]);
  const [tickKey, setTickKey] = useState(null);
  const [open, setOpen] = useState({ documents: false, track: false, more: false });
  const [copyRequest, setCopyRequest] = useState(null);
  const [mountedAt] = useState(() => new Date());

  const setFold = (name, value) => setOpen((prev) => ({ ...prev, [name]: value }));

  useEffect(() => {
    let stale = false;
    ticksKey(caseId).then((key) => {
      if (stale) return;
      setTickKey(key);
      const saved = loadTicks(key);
      // Merged, not replaced: a tick made in the instant before the key
      // arrived is not thrown away by the load.
      if (saved.length > 0) setTicks((prev) => [...new Set([...saved, ...prev])]);
    });
    return () => { stale = true; };
  }, [caseId]);

  // "Copy complaint text" opens the fold and, once it is open, lands on the box.
  // Focus goes to the textarea so the copy is one press away and a screen
  // reader is told where it went. A fold that opens by animating its height
  // keeps its contents unrendered for the first frame, and focus() on something
  // unrendered does nothing - so it is retried on the next frames until it
  // takes. Scrolling comes after, and again when the fold has finished growing,
  // because the page is not tall enough to centre the box until then.
  useEffect(() => {
    if (!copyRequest) return undefined;
    let frame = 0;
    let tries = 0;
    const box = () => document.getElementById(copyRequest.id);
    const centre = () => box()?.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    const land = () => {
      box()?.focus({ preventScroll: true });
      if (box() && document.activeElement === box()) return centre();
      if (++tries < 12) frame = requestAnimationFrame(land);
      return undefined;
    };
    land();
    const settled = setTimeout(centre, 260);
    return () => { cancelAnimationFrame(frame); clearTimeout(settled); };
  }, [copyRequest]);

  if (!plan) return null;
  // A reopened case carries its own confirmed fields; a freshly built plan
  // does not, so the flow's own copy is used there.
  const values = plan.fields ?? fields ?? {};
  const today = now ?? mountedAt;
  const steps = plan.steps ?? [];
  const { done, total } = progressOf(steps, ticks);
  const letter = bankLetter(values, plan.path);
  // The footer already carries the standard lines on every screen; only a line
  // it does not have is worth repeating here.
  const extra = extraDisclaimers(plan.disclaimers);

  function toggle(id) {
    const next = ticks.includes(id) ? ticks.filter((t) => t !== id) : [...ticks, id];
    setTicks(next);
    saveTicks(tickKey, next);
  }

  function copyTo(id) {
    setFold("documents", true);
    setCopyRequest({ id });
  }

  const targets = [
    { id: "now", label: "Now" },
    steps.length > 0 && { id: "checklist", label: "Checklist" },
    timelineRows(plan.clocks).length > 0 && { id: "dates", label: "Dates" },
    { id: "more", label: "More" },
  ].filter(Boolean);

  return (
    <div className="plan">
      {!reopened && <PlanReady />}
      <Summary fields={values} />
      <JumpBar targets={targets} onJump={(id) => id === "more" && setFold("more", true)} />

      <div className="plan-side">
        <Progress done={done} total={total} />
        <NowHero caseId={caseId} clocks={plan.clocks} script={plan.script} />
        {plan.notSure && (
          <Notice kind="warn">
            You weren&apos;t sure, so Thaam used the path with the most protection.
            Report to your bank quickly either way.
          </Notice>
        )}
      </div>

      <div className="plan-main">
        <Checklist
          steps={steps}
          clocks={plan.clocks}
          ticks={ticks}
          onToggle={toggle}
          onCopy={copyTo}
          canCopy={(id) => (id === "bank_letter" ? Boolean(letter) : true)}
          now={today}
        />
        <Timeline clocks={plan.clocks} now={today} />

        <Fold
          id="documents"
          icon="file-text"
          title="Documents to copy"
          open={open.documents}
          onToggle={(value) => setFold("documents", value)}
        >
          <Documents fields={values} path={plan.path} letter={letter} />
        </Fold>

        <Fold
          icon="bell"
          title="Stay on track"
          open={open.track}
          onToggle={(value) => setFold("track", value)}
        >
          <RemindersSection
            reminders={reminders}
            ui={remindersUi}
            demoMode={demoMode}
            onEnrol={onEnrol}
          />
          <FamilySection family={family} ui={familyUi} onShare={onShare} />
        </Fold>

        <Fold
          id="more"
          icon="lock-keyhole"
          title="Your case"
          open={open.more}
          onToggle={(value) => setFold("more", value)}
        >
          <section className="card">
            <h2>Keep this page</h2>
            <p>
              Bookmark this page to come back to your plan. Anyone with this link
              can see your case — don&apos;t share it.
            </p>
          </section>

          <DeleteCase
            confirming={confirmDelete}
            ui={deleteUi}
            onRequest={onDeleteRequest}
            onCancel={onDeleteCancel}
            onConfirm={onDelete}
          />

          <StartNewCase
            confirming={confirmRestart}
            onRequest={onRestartRequest}
            onCancel={onRestartCancel}
            onConfirm={onRestart}
          />
        </Fold>

        {extra.length > 0 && (
          <ul className="plan-disclaimers">
            {extra.map((line) => <li key={line}>{line}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
