// The flow screens of the redesign (H2): what each one says, and - more
// important - what it must still say. Several sentences here are consent,
// privacy or triage wording that may be laid out differently but never
// reworded, so they are pinned character for character below.
//
// DOM-free like the rest of the suite: renderToStaticMarkup returns a string.
// Effects do not run in it, so the timers and object URLs are covered by the
// data they are driven from, not by clocking a real render.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement as h } from "react";
import ActionBar from "../components/ActionBar";
import Stepper from "../components/Stepper";
import Consent from "../screens/Consent";
import Extracting from "../screens/Extracting";
import Fields from "../screens/Fields";
import Triage from "../screens/Triage";
import Upload from "../screens/Upload";
import Welcome from "../screens/Welcome";
import { READING_STAGES } from "../reading";
import { pickFields } from "../state";

globalThis.window = { location: { hash: "", pathname: "/", search: "" }, history: {} };
globalThis.URL.createObjectURL ??= () => "blob:x";

const noop = () => {};

/** The visible words of a piece of markup, entities decoded, spacing collapsed. */
function words(html) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const render = (element) => renderToStaticMarkup(element);

describe("welcome (S0)", () => {
  const html = render(h(Welcome, { onContinue: noop }));
  const text = words(html);

  it("asks the question in the title", () => {
    expect(html).toContain("<h1");
    expect(text).toContain("Money left your account? We'll take this one step at a time.");
  });

  it("puts the 1930 call first, as the hero", () => {
    expect(html).toContain('class="card call-now"');
    expect(text).toContain("Do this first");
    expect(text).toContain(
      "In the first hour, 1930 can sometimes freeze the money before it moves on.",
    );
    expect(html).toMatch(/<a class="button button-call" href="tel:1930">/);
    expect(text).toContain("Call 1930 now");
  });

  it("says the three things Thaam is not, in three rows", () => {
    expect(text).toContain("Thaam never files anything for you. You stay in control.");
    expect(text).toContain("Not a bank, not the police, not the government.");
    expect(text).toContain("Delete your case any time, in one tap.");
    expect(html.match(/<li class="row"/g)).toHaveLength(3);
  });

  it("keeps the call the only filled button", () => {
    // The action-bar button is the quiet one, so nothing competes with the call.
    const buttons = [...html.matchAll(/<(?:a|button)\b[^>]*class="([^"]*\bbutton\b[^"]*)"/g)]
      .map(([, cls]) => cls);
    const filled = buttons.filter((cls) => !cls.includes("button-quiet"));
    expect(filled).toEqual(["button button-call"]);
    expect(text).toContain("Get my plan · about 2 minutes");
  });

  it("lives in the action bar", () => {
    expect(html).toMatch(/<div class="action-bar"><button[^>]*button-quiet/);
  });
});

describe("consent (S1): every sentence survives verbatim", () => {
  const html = render(h(Consent, { consent: false, onToggle: noop, onContinue: noop }));
  const text = words(html);

  it.each([
    "Thaam helps you take the right steps in the first hours after an online payment fraud, in the order that matters.",
    "Your screenshot, to read the payment details. Deleted after 7 days.",
    "Those details and your action plan. Deleted after 90 days.",
    "It never files a complaint for you. You stay in control of every step.",
    "It is not a government service, not the police and not your bank.",
    "It gives guidance, not legal advice.",
    "It cannot tell you whether a message is a scam.",
    "I agree to Thaam storing my screenshot and case details as described above.",
  ])("%s", (sentence) => {
    expect(text).toContain(sentence);
  });

  it("keeps the title and both headings", () => {
    expect(text).toContain("Before we start");
    expect(text).toContain("What we keep");
    expect(text).toContain("What Thaam does not do");
  });

  it("shows the six sentences as icon rows, not bullets", () => {
    expect(html.match(/<li class="row"/g)).toHaveLength(6);
    expect(html).not.toContain('class="plain"');
  });

  it("no longer repeats the privacy link - the footer carries it", () => {
    expect(text).not.toContain("How Thaam handles your data");
  });

  it("marks the checked card, and only when checked", () => {
    expect(html).not.toContain("check-on");
    const on = render(h(Consent, { consent: true, onToggle: noop, onContinue: noop }));
    expect(on).toContain('class="check check-on"');
  });

  it("holds Continue in the action bar, disabled until agreed", () => {
    expect(html).toMatch(/<div class="action-bar"><button[^>]*disabled=""[^>]*>Continue<\/button>/);
    const on = render(h(Consent, { consent: true, onToggle: noop, onContinue: noop }));
    expect(on).not.toMatch(/disabled=""/);
  });
});

describe("the step indicator", () => {
  it("says the step in words and names the group for screen readers", () => {
    const html = render(h(Stepper, { step: 2, of: 3, label: "Details" }));
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Step 2 of 3"');
    expect(words(html)).toBe("Step 2 of 3 · Details");
  });

  it.each([1, 2, 3])("fills exactly %i bar(s)", (step) => {
    const html = render(h(Stepper, { step, of: 3, label: "x" }));
    expect(html.match(/stepper-bar stepper-bar-on/g)).toHaveLength(step);
    expect(html.match(/class="stepper-bar[ "]/g)).toHaveLength(3);
  });

  it("hides the decorative bars from screen readers", () => {
    expect(render(h(Stepper, { step: 1, of: 3, label: "x" }))).toContain(
      '<span class="stepper-bars" aria-hidden="true">',
    );
  });
});

describe("upload (S2)", () => {
  const html = render(h(Upload, {
    file: null, busy: false, error: null, onChoose: noop, onSubmit: noop,
  }));
  const text = words(html);

  it("keeps the real file input in the DOM, hidden the accessible way", () => {
    const input = /<input[^>]*type="file"[^>]*>/.exec(html)?.[0];
    expect(input).toBeTruthy();
    expect(input).toContain('id="screenshot"');
    expect(input).toContain('class="sr-only"');
    // display:none would take it out of the tab order and the accessibility tree.
    expect(html).not.toMatch(/display:\s*none/);
    expect(html).not.toMatch(/\shidden[=\s>]/);
  });

  it("gives the zone as a label for that input", () => {
    expect(html).toMatch(/<label class="dropzone" for="screenshot">/);
    expect(text).toContain("Tap to add screenshot");
    expect(text).toContain("Take a photo or choose from gallery");
  });

  it("keeps the lead and the privacy sentence verbatim", () => {
    expect(text).toContain(
      "The SMS or UPI app screen that shows the money leaving your account.",
    );
    expect(text).toContain(
      "Your screenshot is resized on this phone and its location data removed before upload. PNG or JPEG.",
    );
  });

  it("holds Upload and continue in the action bar, disabled with no file", () => {
    expect(html).toMatch(
      /<div class="action-bar"><button[^>]*disabled=""[^>]*>Upload and continue<\/button>/,
    );
  });
});

describe("reading (S3)", () => {
  it("says something true at each stage, and never a percentage", () => {
    expect(READING_STAGES.map((stage) => stage.text)).toEqual([
      "This takes a few seconds. Please keep this page open.",
      "Finding the amount, date and UTR…",
      "Almost there — keep this page open.",
    ]);
    expect(READING_STAGES.map((stage) => stage.after)).toEqual([0, 4000, 9000]);
    for (const stage of READING_STAGES) expect(stage.text).not.toMatch(/%/);
  });

  it("opens on the first message, in the polite live region, with a skeleton", () => {
    const html = render(h(Extracting, { busy: true, error: null, onRetry: noop }));
    expect(html).toContain("Reading your screenshot…");
    expect(html).toContain('aria-live="polite"');
    expect(words(html)).toContain("This takes a few seconds. Please keep this page open.");
    expect(html.match(/class="skeleton-field"/g)).toHaveLength(3);
    expect(html).toContain('<div class="skeleton" aria-hidden="true">');
  });

  it("shows the error and its retry, and no skeleton, once it has failed", () => {
    const html = render(h(Extracting, {
      busy: false, error: { message: "Something went wrong." }, onRetry: noop,
    }));
    expect(html).toContain('role="alert"');
    expect(words(html)).toContain("Something went wrong.");
    expect(words(html)).toContain("Try again");
    expect(html).not.toContain("skeleton");
  });
});

describe("check the details (S4)", () => {
  const props = {
    file: null, fieldErrors: {}, focusField: null, unreadable: false, busy: false,
    onChange: noop, onContinue: noop,
  };
  // utr and payee_phone were not found; the victim has typed into neither.
  const found = pickFields({
    amount: "49999.00", txn_date: "2026-09-17", txn_time: "10:41:07",
    account_masked: "XX1234", payee_vpa: "refund.help99@okaxis", bank: "Sample Bank",
  });
  const html = render(h(Fields, {
    ...props, fields: found, missingFields: ["utr", "payee_phone"],
  }));
  const text = words(html);

  it("keeps the lead verbatim", () => {
    expect(text).toContain("6 of 8 details found in your screenshot.");
    expect(text).toContain("Correct anything that is wrong, and fill in what you can.");
  });

  it("keeps the unreadable notice verbatim", () => {
    const unreadable = render(h(Fields, {
      ...props, fields: pickFields(null), missingFields: Object.keys(found), unreadable: true,
    }));
    expect(words(unreadable)).toContain("We couldn't read this image — please type the details.");
  });

  it("groups the eight fields into Payment and Accounts, in the old order", () => {
    const [payment, accounts] = html.split('<section class="group"').slice(1);
    const order = (chunk) => [...chunk.matchAll(/<input id="([a-z_]+)"/g)].map(([, id]) => id);
    expect(order(payment)).toEqual(["amount", "txn_date", "txn_time", "utr"]);
    expect(order(accounts)).toEqual(["account_masked", "bank", "payee_vpa", "payee_phone"]);
    expect(html).toContain(">Payment</h2>");
    expect(html).toContain(">Accounts</h2>");
  });

  it("marks what was read as Found and what was not as Needs you", () => {
    expect(html.match(/badge badge-found/g)).toHaveLength(6);
    expect(html.match(/badge badge-needs/g)).toHaveLength(2);
    expect(text).toContain("Found");
    expect(text).toContain("Needs you");
  });

  it("still tells a screen reader what is missing, in the old words", () => {
    const sentence = /<p class="sr-only">Not found — please type it if you can<\/p>/g;
    expect(html.match(sentence)).toHaveLength(2);
    // The visible pill is hidden from screen readers so it is not said twice.
    expect(html).toContain('badge badge-needs" aria-hidden="true"');
  });

  it("shows nothing once the victim has typed into a missing field", () => {
    const typed = render(h(Fields, {
      ...props,
      fields: { ...found, utr: "426173859012" },
      missingFields: ["utr", "payee_phone"],
    }));
    expect(typed.match(/badge badge-needs/g)).toHaveLength(1);
    // Not "Found" either: it was not found, they supplied it.
    expect(typed.match(/badge badge-found/g)).toHaveLength(6);
  });

  it("keeps the needed marker and holds Continue in the action bar", () => {
    expect(html.match(/\(needed\)/g)).toHaveLength(2);
    expect(html).toMatch(/<div class="action-bar"><button type="submit"/);
  });

  it("renders no screenshot thumbnail when there is no file", () => {
    expect(html).not.toContain("compare");
  });
});

describe("one question (S5)", () => {
  const html = render(h(Triage, {
    shared: "no", busy: false, error: null, onAnswer: noop, onSubmit: noop, onBack: noop,
  }));
  const text = words(html);

  it("keeps the D116 question and the reassurance verbatim", () => {
    expect(text).toContain(
      "Did you approve this payment yourself, or share an OTP, UPI PIN or password with anyone before it happened?",
    );
    expect(text).toContain(
      "Either answer is fine. Scammers are very good at tricking people. Your answer only changes which deadlines apply.",
    );
  });

  it("keeps the three answers verbatim", () => {
    expect(text).toContain("Yes — I approved it or shared a code");
    expect(text).toContain("No — it happened without me");
    expect(text).toContain("I'm not sure");
  });

  it("highlights only the chosen card", () => {
    expect(html.match(/option option-on/g)).toHaveLength(1);
    expect(html).toMatch(/option option-on"[^>]*for="triage-no"|for="triage-no"[^>]*option-on/);
  });

  it("puts Build my plan first and Back second, both in the action bar", () => {
    const bar = html.slice(html.indexOf('<div class="action-bar">'));
    expect(bar.indexOf("Build my plan")).toBeGreaterThan(-1);
    expect(bar.indexOf("Build my plan")).toBeLessThan(bar.indexOf("Back to the details"));
  });
});

describe("the action bar", () => {
  it("wraps whatever it is given", () => {
    expect(render(h(ActionBar, null, h("button", null, "Go")))).toBe(
      '<div class="action-bar"><button>Go</button></div>',
    );
  });
});
