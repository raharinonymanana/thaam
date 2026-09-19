import { groupSteps, relativeDay, shortIstDate, stepDeadline } from "../planview";
import Icon from "./Icon";

// The two steps that have a document to copy, and the button that goes to it.
// Both open the Documents fold and land on the right text box.
const COPY_ACTIONS = {
  file_ncrp: { label: "Copy complaint text", target: "copy-ncrp" },
  bank_letter: { label: "Copy bank letter", target: "copy-letter" },
};

/** "In 3 days · Tue 22 Sep", coloured by how close it is - and worded, so the
 * colour is never the only thing saying so. */
function DeadlineChip({ iso, now }) {
  const rel = relativeDay(iso, now);
  if (!rel) return null;
  return (
    <p className={`chip chip-${rel.tone}`}>
      <Icon name="clock" size={12} />
      {`${rel.text} · ${shortIstDate(iso)}`}
    </p>
  );
}

function Step({ step, clocks, done, canCopy, onToggle, onCopy, now }) {
  const deadline = stepDeadline(step, clocks);
  const action = COPY_ACTIONS[step.id];
  // The hero is the instructions for calling, so the call step repeats none.
  const isCall = step.id === "call_1930";
  const id = `tick-${step.id}`;

  return (
    <li className={`step${done ? " step-done" : ""}`}>
      {/* The whole row is the tap target, and the label is the step's title:
          without it a screen reader announces a bare "checkbox". */}
      <label className="tick" htmlFor={id}>
        <input
          id={id}
          className="tick-input"
          type="checkbox"
          checked={done}
          onChange={() => onToggle(step.id)}
        />
        <span className="tick-title">{step.title}</span>
      </label>

      <div className="step-body">
        {deadline && <DeadlineChip iso={deadline} now={now} />}
        {!isCall && step.detail && <p className="step-detail">{step.detail}</p>}
        {step.tel && !isCall && (
          <a className="step-link" href={`tel:${step.tel}`}>Call {step.tel}</a>
        )}
        {step.url && (
          <a className="step-link" href={step.url} target="_blank" rel="noopener noreferrer">
            Open {new URL(step.url).host}
          </a>
        )}
        {action && canCopy(step.id) && (
          <button type="button" className="linkish step-action" onClick={() => onCopy(action.target)}>
            {action.label}
          </button>
        )}
      </div>
    </li>
  );
}

/** The steps as a checklist in three groups. Ticking one changes how it looks
 * and nothing else: rows never reorder, so a row never moves under a thumb. */
export default function Checklist({ steps, clocks, ticks, onToggle, onCopy, canCopy, now }) {
  const groups = groupSteps(steps);
  if (groups.length === 0) return null;
  return (
    <section id="checklist" className="card" tabIndex={-1}>
      <h2>Your checklist</h2>
      {groups.map((group) => (
        <div key={group.id} className="step-group">
          <h3 className="group-heading">{group.title}</h3>
          <ul className="steps-list" role="list">
            {group.items.map((step) => (
              <Step
                key={step.id}
                step={step}
                clocks={clocks}
                done={ticks.includes(step.id)}
                canCopy={canCopy}
                onToggle={onToggle}
                onCopy={onCopy}
                now={now}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
