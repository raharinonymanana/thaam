// Every input the app renders must have a label carrying its visible text,
// and every text-like input must be a type the stylesheet actually styles.
//
// Both were found by hand in a browser: checkboxes were announced as "on", the
// triage radios as their wire values ("yes", "no", "not_sure"), and the email
// inputs rendered as unstyled boxes a third the height of the others. Neither
// is visible in a pure-logic test, and neither is visible on screen either -
// which is exactly why they need a guard.
//
// DOM-free: renderToStaticMarkup returns a string, so there is no jsdom here.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement as h } from "react";
import Consent from "../screens/Consent";
import Upload from "../screens/Upload";
import Fields from "../screens/Fields";
import Triage from "../screens/Triage";
import PlanView from "../components/PlanView";
import { pickFields } from "../state";

globalThis.window = { location: { hash: "", pathname: "/", search: "" }, history: {} };
globalThis.URL.createObjectURL ??= () => "blob:x";

const PLAN = {
  path: "unauthorised", notSure: false, clocks: {}, steps: [],
  script: { en: "Hello.", hi: "नमस्ते" }, disclaimers: [],
};

const planView = (props) => h(PlanView, {
  caseId: "abcdefghijklmnopqrstuv", plan: PLAN,
  reminders: null, remindersUi: { busy: false, error: null },
  family: { sendsRemaining: 3, sent: false }, familyUi: { busy: false, error: null },
  demoMode: true, confirmRestart: false,
  onEnrol: () => {}, onShare: () => {},
  onRestartRequest: () => {}, onRestartCancel: () => {}, onRestart: () => {},
  ...props,
});

const SCREENS = {
  consent: h(Consent, { consent: false, onToggle: () => {}, onContinue: () => {} }),
  upload: h(Upload, {
    file: null, busy: false, error: null, onChoose: () => {}, onSubmit: () => {},
  }),
  fields: h(Fields, {
    fields: pickFields({}), fieldErrors: {}, focusField: null, missingFields: [],
    unreadable: false, busy: false, onChange: () => {}, onContinue: () => {},
  }),
  triage: h(Triage, {
    shared: null, busy: false, error: null,
    onAnswer: () => {}, onSubmit: () => {}, onBack: () => {},
  }),
  plan: planView({}),
};

/** Every <input> in the markup, with its id and type. */
function inputs(html) {
  return [...html.matchAll(/<input\b[^>]*>/g)].map(([tag]) => ({
    tag,
    id: /\bid="([^"]+)"/.exec(tag)?.[1] ?? null,
    type: /\btype="([^"]+)"/.exec(tag)?.[1] ?? "text",
  }));
}

/** The visible text of the label pointing at an id. */
function labelTextFor(html, id) {
  const match = new RegExp(`<label[^>]*\\bfor="${id}"[^>]*>([\\s\\S]*?)</label>`).exec(html);
  if (!match) return null;
  return match[1]
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe.each(Object.entries(SCREENS))("%s screen", (name, element) => {
  const html = renderToStaticMarkup(element);

  it("gives every input an id and a label carrying its visible text", () => {
    const found = inputs(html);
    expect(found.length).toBeGreaterThan(0);
    for (const input of found) {
      expect(input.id, `an input on ${name} has no id: ${input.tag}`).toBeTruthy();
      const text = labelTextFor(html, input.id);
      expect(text, `no <label for="${input.id}"> on ${name}`).toBeTruthy();
      expect(text.length, `label for ${input.id} is too short: "${text}"`).toBeGreaterThan(3);
    }
  });

  it("never leaves a checkbox or radio to be named by its value", () => {
    for (const input of inputs(html).filter((i) => ["checkbox", "radio"].includes(i.type))) {
      const text = labelTextFor(html, input.id);
      const value = /\bvalue="([^"]*)"/.exec(input.tag)?.[1];
      expect(text).toBeTruthy();
      // The name must be the sentence, not "on" or the wire value.
      expect(text).not.toBe("on");
      if (value) expect(text).not.toBe(value);
      expect(text.split(" ").length).toBeGreaterThan(2);
    }
  });
});

describe("the named cases from the bug report", () => {
  it("the consent checkbox is named by its sentence", () => {
    const html = renderToStaticMarkup(SCREENS.consent);
    expect(labelTextFor(html, "consent-agree"))
      .toBe("I agree to Thaam storing my screenshot and case details as described above.");
  });

  it("each triage radio is named by its answer", () => {
    const html = renderToStaticMarkup(SCREENS.triage);
    expect(labelTextFor(html, "triage-yes")).toBe("Yes — I approved it or shared a code");
    expect(labelTextFor(html, "triage-no")).toBe("No — it happened without me");
    expect(labelTextFor(html, "triage-not_sure")).toBe("I'm not sure");
  });

  it("both reminder checkboxes are named by their sentence", () => {
    const html = renderToStaticMarkup(SCREENS.plan);
    expect(labelTextFor(html, "reminder-agree")).toMatch(/^Email me before each deadline/);
    expect(labelTextFor(html, "reminder-demo"))
      .toBe("Demo timing — send all reminders within 5 minutes");
    expect(labelTextFor(html, "reminder-email")).toBe("Your email");
  });

  it("the file input is named", () => {
    expect(labelTextFor(renderToStaticMarkup(SCREENS.upload), "screenshot")).toBe("Screenshot");
  });
});

// Types the browser draws itself; the stylesheet leaves them alone.
const UNSTYLED_TYPES = ["button", "submit", "checkbox", "radio", "file"];

describe("the stylesheet covers every text-like input", () => {
  const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
  const styled = new Set(
    [...css.matchAll(/\.field input\[type="([a-z]+)"\]/g)].map(([, type]) => type),
  );

  it("styles a type it knows about", () => {
    expect(styled.has("text")).toBe(true);
    expect(styled.size).toBeGreaterThan(3);
  });

  it.each(Object.entries(SCREENS))("%s screen renders no unstyled input", (name, element) => {
    const rendered = inputs(renderToStaticMarkup(element))
      .map((input) => input.type)
      .filter((type) => !UNSTYLED_TYPES.includes(type));
    for (const type of rendered) {
      expect(styled.has(type), `input[type="${type}"] on ${name} has no styling`).toBe(true);
    }
  });
});
