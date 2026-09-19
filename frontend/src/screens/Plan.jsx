import Screen from "../components/Screen";
import PlanView from "../components/PlanView";

/** A plan that has just been built. The case summary and the "plan is ready"
 * moment are part of PlanView, so the screen is only its title. */
export default function Plan({ caseId, plan, ...rest }) {
  return (
    <Screen title="Your plan">
      <PlanView key={caseId} caseId={caseId} plan={plan} {...rest} />
    </Screen>
  );
}
