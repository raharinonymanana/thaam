/** "Step 2 of 3 · Details", with three bars that fill as the flow advances.
 *
 * Only the three screens that ask for something carry one - welcome, consent
 * and the plan are not steps. The words do the work; the bars are decoration
 * for the eye, so they are hidden from screen readers and the group is named
 * "Step n of 3" instead of being read out bar by bar.
 */
export default function Stepper({ step, of = 3, label }) {
  return (
    <div className="stepper" role="group" aria-label={`Step ${step} of ${of}`}>
      <span className="stepper-text">{`Step ${step} of ${of} · ${label}`}</span>
      <span className="stepper-bars" aria-hidden="true">
        {Array.from({ length: of }, (_, i) => (
          <span key={i} className={`stepper-bar${i < step ? " stepper-bar-on" : ""}`} />
        ))}
      </span>
    </div>
  );
}
