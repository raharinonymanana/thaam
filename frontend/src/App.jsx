import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  ApiError, buildPlan, createCase, deleteCase, enrolReminders, extract, getCase,
  shareWithFamily, uploadToS3, UNEXPECTED_MESSAGE,
} from "./api";
import { clearCaseHash, parseCaseHash, setCaseHash } from "./hash";
import { DECODE_MESSAGE, ENCODE_MESSAGE, prepareImage, REJECT_MESSAGE } from "./image";
import { isDemoMode } from "./reminders";
import { initialState, planPayload, reducer } from "./state";
import { validateFields } from "./validate";
import Footer from "./components/Footer";
import LogoMark from "./components/LogoMark";
import Case from "./screens/Case";
import Consent from "./screens/Consent";
import Extracting from "./screens/Extracting";
import Fields from "./screens/Fields";
import Deleted from "./screens/Deleted";
import Plan from "./screens/Plan";
import Privacy from "./screens/Privacy";
import Triage from "./screens/Triage";
import Upload from "./screens/Upload";

// Messages we wrote for a victim to read. Anything else - a TypeError, a
// stack, an S3 XML blob - is replaced by a plain sentence, so no internal
// detail can ever reach the screen.
const FRIENDLY = new Set([REJECT_MESSAGE, DECODE_MESSAGE, ENCODE_MESSAGE]);

const NO_PLAN_MESSAGE =
  "This case was never finished, so there is no plan to show. You can start again.";

const DEMO_DISABLED_MESSAGE = "Demo timing is not enabled.";

function notice(err) {
  if (err instanceof ApiError) return { message: err.message, code: err.code };
  if (FRIENDLY.has(err?.message)) return { message: err.message, code: "image" };
  return { message: UNEXPECTED_MESSAGE, code: "unexpected" };
}

/** A reminder email links to #case=<caseId> (D111), so a case to reopen is
 * known before the first render and the consent screen never flashes. */
function start() {
  const caseId = parseCaseHash(window.location.hash);
  return caseId ? { ...initialState, screen: "case", caseId, busy: true } : initialState;
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, start);
  const requested = useRef(null);
  const latest = useRef(state);

  useEffect(() => { latest.current = state; });

  const loadCase = useCallback(async (caseId) => {
    requested.current = caseId;
    dispatch({ type: "case_requested", caseId });
    try {
      dispatch({ type: "case_loaded", caseView: await getCase(caseId) });
    } catch (err) {
      // An expired case is deleted lazily but answers 404 either way, so
      // "expired or does not exist" is the whole truth we have.
      if (err instanceof ApiError && err.status === 404) {
        dispatch({ type: "case_not_found" });
      } else if (err instanceof ApiError && err.status === 409) {
        dispatch({ type: "submit_failed", error: { message: NO_PLAN_MESSAGE, code: "no_plan" } });
      } else {
        dispatch({ type: "submit_failed", error: notice(err) });
      }
    }
  }, []);

  // Fetch the case once per ID. The ref survives StrictMode's double effect in
  // development, which would otherwise send the request twice.
  useEffect(() => {
    if (state.screen !== "case" || !state.caseId) return;
    if (requested.current === state.caseId) return;
    loadCase(state.caseId);
  }, [state.screen, state.caseId, loadCase]);

  // Someone can paste another case link, or edit the fragment away, without
  // the page reloading. Both have to be honoured: the first opens that case,
  // the second means "I am done with this one".
  useEffect(() => {
    function onHashChange() {
      const next = parseCaseHash(window.location.hash);
      if (next) {
        if (next !== latest.current.caseId) loadCase(next);
      } else if (latest.current.screen === "case") {
        dispatch({ type: "restart" });
      }
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [loadCase]);

  const runExtract = useCallback(async (caseId) => {
    dispatch({ type: "extract_started" });
    try {
      const result = await extract(caseId);
      dispatch({ type: "extract_succeeded", fields: result.fields });
    } catch (err) {
      // 422 is not a failure of the flow: Textract could not read this image,
      // so the victim types the eight details instead and carries on.
      if (err instanceof ApiError && err.code === "unreadable") {
        dispatch({ type: "extract_unreadable" });
      } else {
        dispatch({ type: "submit_failed", error: notice(err) });
      }
    }
  }, []);

  async function handleUpload(file) {
    if (!file || state.busy) return;
    dispatch({ type: "submit_started" });
    let caseId;
    try {
      // Resize first, then create the case: the presigned form expires in five
      // minutes, so it must not be waiting while a 12 MP photo is re-encoded.
      const prepared = await prepareImage(file);
      const created = await createCase({ consent: state.consent });
      await uploadToS3(created.upload, prepared.blob);
      caseId = created.caseId;
    } catch (err) {
      dispatch({ type: "submit_failed", error: notice(err) });
      return;
    }
    dispatch({ type: "uploaded", caseId });
    await runExtract(caseId);
  }

  function handleFieldsContinue() {
    const { errors, focus, ok } = validateFields(state.fields);
    if (!ok) {
      dispatch({ type: "fields_invalid", errors, focus });
      return;
    }
    dispatch({ type: "fields_accepted" });
  }

  async function submitPlan() {
    if (state.busy || !state.shared) return;
    dispatch({ type: "submit_started" });
    try {
      const plan = await buildPlan(state.caseId, {
        fields: planPayload(state.fields),
        sharedCredentials: state.shared,
      });
      // From here the case is worth coming back to, so it goes in the address
      // bar - in the fragment, which never reaches a server (D111).
      setCaseHash(state.caseId);
      requested.current = state.caseId;
      dispatch({ type: "plan_succeeded", plan });
    } catch (err) {
      // The server checks the eight fields again and is the authority. When it
      // names one, the victim goes back to that field with its wording.
      if (err instanceof ApiError && err.code === "invalid_field" && err.field) {
        dispatch({ type: "plan_rejected_field", field: err.field, message: err.message });
      } else {
        dispatch({ type: "submit_failed", error: notice(err) });
      }
    }
  }

  async function enrol({ email, demo }) {
    if (state.remindersUi.busy) return;
    dispatch({ type: "reminders_submitting" });
    try {
      const result = await enrolReminders(state.caseId, { email, demo });
      dispatch({ type: "reminders_enrolled", ...result, demo });
    } catch (err) {
      const error = err instanceof ApiError && err.code === "demo_disabled"
        ? { message: DEMO_DISABLED_MESSAGE, code: err.code }
        : notice(err);
      dispatch({ type: "reminders_failed", error });
    }
  }

  async function share({ email, toName }) {
    if (state.familyUi.busy) return;
    dispatch({ type: "family_submitting" });
    try {
      const result = await shareWithFamily(state.caseId, { email, toName });
      dispatch({ type: "family_sent", sendsRemaining: result.sendsRemaining });
    } catch (err) {
      // 429 is the server's count, not ours, and it closes the form.
      if (err instanceof ApiError && err.code === "limit_reached") {
        dispatch({ type: "family_limit_reached" });
      } else {
        // 422 address_not_approved carries the sandbox explanation; show it
        // exactly as the backend wrote it.
        dispatch({ type: "family_failed", error: notice(err) });
      }
    }
  }

  async function removeCase() {
    if (state.deleteUi.busy) return;
    dispatch({ type: "delete_submitting" });
    try {
      await deleteCase(state.caseId);
    } catch (err) {
      // 404 means it is already gone, which is the outcome that was asked for.
      if (!(err instanceof ApiError && err.status === 404)) {
        dispatch({ type: "delete_failed", error: notice(err) });
        return;
      }
    }
    requested.current = null;
    // The link must not survive the case it points at (keeps ?demo=1).
    clearCaseHash();
    dispatch({ type: "delete_succeeded" });
  }

  function restart() {
    requested.current = null;
    // Keeps ?demo=1 (D112); only the case fragment goes.
    clearCaseHash();
    dispatch({ type: "restart" });
  }

  // Everything the plan view needs, shown identically on both screens.
  const planProps = {
    reminders: state.reminders,
    remindersUi: state.remindersUi,
    family: state.family,
    familyUi: state.familyUi,
    demoMode: isDemoMode(window.location.search),
    confirmRestart: state.confirmRestart,
    onEnrol: enrol,
    onShare: share,
    onRestartRequest: () => dispatch({ type: "restart_requested" }),
    onRestartCancel: () => dispatch({ type: "restart_cancelled" }),
    onRestart: restart,
    confirmDelete: state.confirmDelete,
    deleteUi: state.deleteUi,
    onDeleteRequest: () => dispatch({ type: "delete_requested" }),
    onDeleteCancel: () => dispatch({ type: "delete_cancelled" }),
    onDelete: removeCase,
  };

  const openPrivacy = () => dispatch({ type: "privacy_opened" });

  return (
    <div className="app">
      <header className="masthead">
        <p className="brand">
          <LogoMark className="logo-mark" size={36} />
          <span>Thaam <span className="brand-hi" lang="hi">थाम</span></span>
        </p>
        <p className="brand-sub">Steady steps after an online payment fraud</p>
      </header>

      <main>
        {state.screen === "consent" && (
          <Consent
            consent={state.consent}
            onToggle={(value) => dispatch({ type: "consent_toggled", value })}
            onContinue={() => dispatch({ type: "consent_given" })}
            onOpenPrivacy={openPrivacy}
          />
        )}

        {state.screen === "upload" && (
          <Upload
            file={state.file}
            busy={state.busy}
            error={state.error}
            onChoose={(file) => dispatch({ type: "file_chosen", file })}
            onSubmit={handleUpload}
          />
        )}

        {state.screen === "extracting" && (
          <Extracting
            busy={state.busy}
            error={state.error}
            onRetry={() => runExtract(state.caseId)}
          />
        )}

        {state.screen === "fields" && (
          <Fields
            fields={state.fields}
            fieldErrors={state.fieldErrors}
            focusField={state.focusField}
            missingFields={state.missingFields}
            unreadable={state.unreadable}
            busy={state.busy}
            onChange={(key, value) => dispatch({ type: "field_changed", key, value })}
            onContinue={handleFieldsContinue}
          />
        )}

        {state.screen === "triage" && (
          <Triage
            shared={state.shared}
            busy={state.busy}
            error={state.error}
            onAnswer={(shared) => dispatch({ type: "triage_answered", shared })}
            onSubmit={submitPlan}
            onBack={() => dispatch({ type: "back_to_fields" })}
          />
        )}

        {state.screen === "plan" && (
          <Plan caseId={state.caseId} plan={state.plan} fields={state.fields} {...planProps} />
        )}

        {state.screen === "privacy" && (
          <Privacy onBack={() => dispatch({ type: "privacy_closed" })} />
        )}

        {state.screen === "deleted" && <Deleted onRestart={restart} />}

        {state.screen === "case" && (
          <Case
            busy={state.busy}
            error={state.error}
            notFound={state.notFound}
            caseView={state.caseView}
            caseId={state.caseId}
            onRetry={() => loadCase(state.caseId)}
            {...planProps}
          />
        )}
      </main>

      <Footer onOpenPrivacy={openPrivacy} />
    </div>
  );
}
