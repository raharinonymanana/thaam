import { relativeDay, shortIstDate, timelineRows } from "../planview";

/** "Dates to know": a vertical timeline of the dates that come from the bank
 * and the RBI. Only the first kind is the victim's to act on, so only those
 * take the urgency colour - shading a date red that nobody can act on would
 * make the page shout about things it cannot help with. */
export default function Timeline({ clocks, now }) {
  const rows = timelineRows(clocks);
  if (rows.length === 0) return null;
  return (
    <section id="dates" className="card" tabIndex={-1}>
      <h2>Dates to know</h2>
      <ol className="timeline" role="list">
        {rows.map((row) => {
          const rel = relativeDay(row.iso, now);
          const tone = row.userDeadline && rel ? rel.tone : "later";
          return (
            <li key={row.id} className={`tl-row${row.userDeadline ? " tl-mine" : ""}`}>
              <p className="tl-label">{row.label}</p>
              <p className="tl-when">
                <span className="tl-date">{shortIstDate(row.iso)}</span>
                {rel && <span className={`chip chip-${tone}`}>{rel.text}</span>}
              </p>
              <p className="tl-note">{row.note}</p>
              {row.url && (
                <a className="step-link" href={row.url} target="_blank" rel="noopener noreferrer">
                  Open the RBI complaint site
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
