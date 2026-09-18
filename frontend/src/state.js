// One reducer for the whole flow (D110): no router, no per-screen state.
//
// The screen is a value in this object, so the app can only ever be in one of
// the states named here, and every move between them is an action below. The
// caseId lives in this object and nowhere else - never in localStorage or
// sessionStorage, because it is the only credential the case has, and a shared
// or borrowed phone must not keep it after the tab closes.

export const SCREENS = ["consent", "upload", "extracting", "fields", "case"];

// The eight details the plan is built from. sender_id, direction and missing
// come back from extract too, but they are not fields the victim confirms.
export const FIELD_KEYS = [
  "amount", "utr", "txn_date", "txn_time",
  "account_masked", "payee_vpa", "payee_phone", "bank",
];

export const initialState = {
  screen: "consent",
  consent: false,
  caseId: null,
  file: null,
  busy: false,
  error: null,
  fields: null,
  unreadable: false,
  caseView: null,
  notFound: false,
};

/** How many of the eight details Textract actually found. */
export function countFound(fields) {
  if (!fields) return 0;
  return FIELD_KEYS.filter((key) => {
    const value = fields[key];
    return typeof value === "string" && value.trim() !== "";
  }).length;
}

/** The eight keys only, each present, missing ones as null. */
export function pickFields(fields) {
  return Object.fromEntries(FIELD_KEYS.map((key) => [key, fields?.[key] ?? null]));
}

const EMPTY_FIELDS = pickFields(null);

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
      };

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
