import Screen from "../components/Screen";
import PlanView from "../components/PlanView";

export default function Plan({ caseId, plan, ...rest }) {
  return (
    <Screen title="Your plan">
      <p className="lead">
        Start at the top. The first call matters most.
      </p>
      <PlanView caseId={caseId} plan={plan} {...rest} />
    </Screen>
  );
}
