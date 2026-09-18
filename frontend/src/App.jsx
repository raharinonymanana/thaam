import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  ApiError, createCase, extract, getCase, uploadToS3, UNEXPECTED_MESSAGE,
} from "./api";
import { clearCaseHash, parseCaseHash } from "./hash";
import { DECODE_MESSAGE, ENCODE_MESSAGE, prepareImage, REJECT_MESSAGE } from "./image";
import { initialState, reducer } from "./state";
import Footer from "./components/Footer";
import Case from "./screens/Case";
import Consent from "./screens/Consent";
import Extracting from "./screens/Extracting";
import Fields from "./screens/Fields";
import Upload from "./screens/Upload";

// Messages we wrote for a victim to read. Anything else - a TypeError, a
// stack, an S3 XML blob - is replaced by a plain sentence, so no internal
// detail can ever reach the screen.
const FRIENDLY = new Set([REJECT_MESSAGE, DECODE_MESSAGE, ENCODE_MESSAGE]);

const NO_PLAN_MESSAGE =
  "This case was never finished, so there is no plan to show. You can start again.";

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

  const loadCase = useCallback(async (caseId) => {
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
    requested.current = state.caseId;
    loadCase(state.caseId);
  }, [state.screen, state.caseId, loadCase]);

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

  function restart() {
    requested.current = null;
    clearCaseHash();
    dispatch({ type: "restart" });
  }

  return (
    <div className="app">
      <header className="masthead">
        <p className="brand">Thaam <span lang="hi">थाम</span></p>
        <p className="brand-sub">Steady steps after an online payment fraud</p>
      </header>

      <main>
        {state.screen === "consent" && (
          <Consent
            consent={state.consent}
            onToggle={(value) => dispatch({ type: "consent_toggled", value })}
            onContinue={() => dispatch({ type: "consent_given" })}
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
          <Fields fields={state.fields} unreadable={state.unreadable} />
        )}

        {state.screen === "case" && (
          <Case
            busy={state.busy}
            error={state.error}
            notFound={state.notFound}
            caseView={state.caseView}
            onRetry={() => loadCase(state.caseId)}
            onRestart={restart}
          />
        )}
      </main>

      <Footer />
    </div>
  );
}
