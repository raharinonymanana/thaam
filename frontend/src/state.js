// One reducer for the whole flow (D110): no router, no per-screen state.
//
// The screen is a value in this object, so the app can only ever be in one of
// the states named here, and every move between them is an action below. The
// caseId lives in this object and nowhere else - never in localStorage or
// sessionStorage, because it is the only credential the case has, and a shared
// or borrowed phone must not keep it after the tab closes.

export const SCREENS = ["consent", "upload", "extracting", "fields", "triage", "plan", "case"];

// The eight details the plan is built from. sender_id, direction and missing
// come back from extract too, but they are not fields the victim confirms.
export const FIELD_KEYS = [
  "amount", "utr", "txn_date", "txn_time",
  "account_masked", "payee_vpa", "payee_phone", "bank",
];

export const REQUIRED_KEYS = ["amount", "txn_date"];

export const SHARED_ANSWERS = ["yes", "no", "not_sure"];

export const initialState = {
  screen: "consent",
  consent: false,
  caseId: null,
  file: null,
  busy: false,
  error: null,
  fields: null,
  fieldErrors: {},
  focusField: null,
  missingFields: [],
  unreadable: false,
  shared: null,
  plan: null,
  caseView: null,
  notFound: false,
};

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

/** How many of the eight details Textract actually found. */
export function countFound(fields) {
  if (!fields) return 0;
  return FIELD_KEYS.filter((key) => hasText(fields[key])).length;
}

/** The eight keys only, each present, missing ones as empty text so they can
 * go straight into an input without React complaining about null values. */
export function pickFields(fields) {
  return Object.fromEntries(
    FIELD_KEYS.map((key) => [key, hasText(fields?.[key]) ? fields[key].trim() : ""]),
  );
}

/** The keys extract could not fill, remembered so the form can mark them even
 * after the victim starts typing into the others. */
export function missingKeys(fields) {
  return FIELD_KEYS.filter((key) => !hasText(fields?.[key]));
}

/** Empty text becomes null on the wire: the backend treats both the same, and
 * null says "not known" more plainly than "". */
export function planPayload(fields) {
  return Object.fromEntries(
    FIELD_KEYS.map((key) => [key, hasText(fields?.[key]) ? fields[key].trim() : null]),
  );
}

const EMPTY_FIELDS = pickFields(null);

function withoutField(errors, key) {
  const { [key]: _dropped, ...rest } = errors;
  return rest;
}

export function reducer(state, action) {
  switch (action.type) {
    case "consent_toggled":
      return { ...state, consent: action.value === true, error: null };

    case "consent_given":
      // Guarded here as well as in the button's disabled state: the flow must
      // not be able to reach an upload without the box actually ticked.
      if (state.consent !== true) return state;
      return { ...state, screen: "upload", error: null };

    case "file_chosen":
      return { ...state, file: action.file ?? null, error: null };

    case "submit_started":
      return { ...state, busy: true, error: null };

    case "submit_failed":
      return { ...state, busy: false, error: action.error ?? null };

    case "uploaded":
      return { ...state, screen: "extracting", caseId: action.caseId, busy: true, error: null };

    case "extract_started":
      return { ...state, screen: "extracting", busy: true, error: null };

    case "extract_succeeded":
      return {
        ...state,
        screen: "fields",
        busy: false,
        error: null,
        unreadable: false,
        fields: pickFields(action.fields),
        missingFields: missingKeys(action.fields),
        fieldErrors: {},
        focusField: null,
      };

    case "extract_unreadable":
      // Not a failure of the flow: Textract could not read this image, so the
      // victim types the details instead. The case itself is fine.
      return {
        ...state,
        screen: "fields",
        busy: false,
        error: null,
        unreadable: true,
        fields: EMPTY_FIELDS,
        missingFields: [...FIELD_KEYS],
        fieldErrors: {},
        focusField: null,
      };

    case "field_changed":
      // Typing into a field clears its complaint: nothing is more irritating
      // than an error that stays on screen after it has been fixed.
      return {
        ...state,
        fields: { ...state.fields, [action.key]: action.value },
        fieldErrors: withoutField(state.fieldErrors, action.key),
        focusField: null,
      };

    case "fields_invalid":
      return {
        ...state,
        screen: "fields",
        busy: false,
        fieldErrors: action.errors ?? {},
        focusField: action.focus ?? null,
      };

    case "fields_accepted":
      return { ...state, screen: "triage", error: null, fieldErrors: {}, focusField: null };

    case "triage_answered":
      if (!SHARED_ANSWERS.includes(action.shared)) return state;
      return { ...state, shared: action.shared, error: null };

    case "back_to_fields":
      return { ...state, screen: "fields", busy: false, error: null, focusField: null };

    case "plan_rejected_field":
      // The server found something we let through. Its wording wins, and the
      // victim is taken back to the field it is about.
      return {
        ...state,
        screen: "fields",
        busy: false,
        error: null,
        fieldErrors: { ...state.fieldErrors, [action.field]: action.message },
        focusField: action.field,
      };

    case "plan_succeeded":
      return { ...state, screen: "plan", busy: false, error: null, plan: action.plan };

    case "case_requested":
      return {
        ...state,
        screen: "case",
        caseId: action.caseId,
        busy: true,
        error: null,
        notFound: false,
      };

    case "case_loaded":
      return { ...state, screen: "case", busy: false, error: null, caseView: action.caseView };

    case "case_not_found":
      return { ...state, screen: "case", busy: false, error: null, notFound: true, caseView: null };

    case "restart":
      return { ...initialState };

    default:
      // A typo in a dispatch is our bug. It fails loudly while developing and
      // leaves the victim's screen untouched in production.
      if (import.meta.env?.DEV ?? true) {
        throw new Error(`Unknown action: ${JSON.stringify(action?.type ?? action)}`);
      }
      return state;
  }
}
