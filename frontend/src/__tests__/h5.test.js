// H5: essentials only. Each screen shows what the step needs; everything else is
// one tap away in "About Thaam" or in a closed fold. These tests pin WHERE every
// sentence now lives - above all that no legal or privacy sentence has gone.
//
// DOM-free like the rest of the suite: renderToStaticMarkup returns a string,
// and a closed <details> still has all its contents in it, exactly as the page
// does, which is what "still in the DOM" means here.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement as h } from "react";
import Footer from "../components/Footer";
import PlanView from "../components/PlanView";
import Consent from "../screens/Consent";
import Privacy from "../screens/Privacy";
import Upload from "../screens/Upload";
import Welcome from "../screens/Welcome";
import { FOOTER_DISCLAIMERS } from "../disclaimers";
import { pickFields } from "../state";

globalThis.window = { location: { hash: "", pathname: "/", search: "" }, history: {} };

const noop = () => {};
const render = (element) => renderToStaticMarkup(element);
const words = (html) => html
  .replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();

const TRUST = [
  "Thaam never files anything for you. You stay in control.",
  "Not a bank, not the police, not the government.",
  "Delete your case any time, in one tap.",
];

describe("the footer: one 'About Thaam' row on every screen", () => {
  const html = render(h(Footer, { onOpenPrivacy: noop }));
  const text = words(html);

  it("is a single closed fold whose summary says About Thaam", () => {
    expect(html.match(/<details\b/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]*\sopen(=|\s|>)/);
    expect(html).toMatch(/<summary[^>]*>[\s\S]*?<span>About Thaam<\/span>/);
  });

  it("puts the icon, the words and the chevron in the summary, decoration hidden", () => {
    const summary = /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(html)[1];
    expect(summary.match(/<svg/g)).toHaveLength(2);
    expect(summary.match(/aria-hidden="true"/g)).toHaveLength(2);
    expect(words(summary)).toBe("About Thaam");
  });

  it("holds, in this order: the three promises, the three disclaimers, the privacy button", () => {
    const at = (needle) => text.indexOf(needle);
    const order = [...TRUST, ...FOOTER_DISCLAIMERS, "How Thaam handles your data"].map(at);
    for (const position of order) expect(position).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("carries every sentence verbatim", () => {
    for (const line of TRUST) expect(text).toContain(line);
    for (const line of FOOTER_DISCLAIMERS) expect(text).toContain(line);
    expect(FOOTER_DISCLAIMERS).toEqual([
      "Thaam is not a government service and is not affiliated with I4C, NCRP, RBI or any bank.",
      "This is guidance, not legal advice.",
      "Deadlines are estimated; act before the dates shown.",
    ]);
  });

  it("no longer shows the disclaimers as an always-visible list, or a bare privacy link", () => {
    // Everything sits inside the one <details>: nothing follows its close tag.
    const outside = html.slice(html.indexOf("</details>"));
    expect(words(outside)).toBe("");
    expect(html.match(/How Thaam handles your data/g)).toHaveLength(1);
    expect(html.match(/<button/g)).toHaveLength(1);
  });

  it("gives the summary a 44px target, the fold way", () => {
    const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.about-summary\s*\{[^}]*min-height:\s*44px/);
  });
});

describe("welcome v2", () => {
  const html = render(h(Welcome, { onContinue: noop }));
  const text = words(html);

  it("asks one question in the title, then one sentence", () => {
    expect(html).toMatch(/<h1[^>]*>Lost money to a UPI fraud\?<\/h1>/);
    expect(text).toContain(
      "We'll guide you step by step: what to do right now, and the bank deadlines after.",
    );
  });

  it("tells the journey in three equal non-interactive cards", () => {
    const list = /<ol[^>]*>([\s\S]*?)<\/ol>/.exec(html);
    expect(list[0]).toContain('aria-label="How it works"');
    const cards = [...list[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(([, inner]) => inner);
    expect(cards.map(words)).toEqual([
      "1 Call 1930", "2 Add your screenshot", "3 Get your plan",
    ]);
    for (const card of cards) {
      expect(card).not.toMatch(/<(a|button|input)\b/);
      // the number badge is hidden from screen readers: the list numbers itself
      expect(card).toMatch(/<span class="journey-num" aria-hidden="true">\d<\/span>/);
    }
  });

  it("has the call as the one filled button, and the plan as the quiet one", () => {
    expect(html).toMatch(/<a class="button button-call" href="tel:1930">/);
    expect(text).toContain("Call 1930 now");
    expect(html).toMatch(/<button[^>]*class="button button-quiet"[^>]*>Get my plan · 2 min<\/button>/);
    const filled = [...html.matchAll(/<(?:a|button)\b[^>]*class="([^"]*\bbutton\b[^"]*)"/g)]
      .map(([, cls]) => cls).filter((cls) => !cls.includes("button-quiet"));
    expect(filled).toEqual(["button button-call"]);
    expect(text).toContain("National cyber crime helpline · the first hour matters most");
  });

  it("reads: title, lead, journey, call, note, plan - in the page, no action bar", () => {
    const at = (needle) => html.indexOf(needle);
    const order = ["<h1", 'class="lead"', "<ol", "tel:1930", "National cyber crime", "Get my plan"].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).not.toContain("action-bar");
  });

  it("no longer carries the hero card, the eyebrow, or the three promise rows", () => {
    expect(html).not.toContain("call-now");
    for (const gone of [
      "Do this first",
      "In the first hour, 1930 can sometimes freeze the money before it moves on.",
      "Money left your account?",
      "Get my plan · about 2 minutes",
      ...TRUST,
    ]) expect(text).not.toContain(gone);
  });
});

describe("consent: a fold above the checkbox", () => {
  const props = { consent: false, onToggle: noop, onContinue: noop };
  const html = render(h(Consent, props));
  const text = words(html);

  it("shows a heading, one closed fold, the checkbox card and Continue - in that order", () => {
    const at = (needle) => html.indexOf(needle);
    const order = ["<h1", "<details", "What you&#x27;re agreeing to", 'class="check', 'class="action-bar"']
      .map(at);
    for (const position of order) expect(position).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.match(/<details\b/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]*\sopen(=|\s|>)/);
  });

  it("has nothing else on the screen outside the fold, the checkbox and the button", () => {
    const outside = html.replace(/<details[\s\S]*<\/details>/, "");
    const visible = words(outside);
    expect(visible).toBe(
      "Before we start I agree to Thaam storing my screenshot and case details as described above. Continue",
    );
  });

  it("keeps every sentence, verbatim, inside the fold", () => {
    const fold = /<details[\s\S]*<\/details>/.exec(html)[0];
    const inside = words(fold);
    for (const sentence of [
      "Thaam helps you take the right steps in the first hours after an online payment fraud, in the order that matters.",
      "What we keep",
      "Your screenshot, to read the payment details. Deleted after 7 days.",
      "Those details and your action plan. Deleted after 90 days.",
      "What Thaam does not do",
      "It never files a complaint for you. You stay in control of every step.",
      "It is not a government service, not the police and not your bank.",
      "It gives guidance, not legal advice.",
      "It cannot tell you whether a message is a scam.",
    ]) expect(inside).toContain(sentence);
    expect(fold.match(/<li class="row"/g)).toHaveLength(6);
  });

  it("keeps the checkbox sentence, and 'above' is true: the fold is above it", () => {
    expect(text).toContain("I agree to Thaam storing my screenshot and case details as described above.");
    expect(html.indexOf("</details>")).toBeLessThan(html.indexOf('class="check'));
  });
});

describe("upload: the lock row is cut", () => {
  const html = render(h(Upload, {
    file: null, busy: false, error: null, onChoose: noop, onSubmit: noop,
  }));
  const text = words(html);

  it("no longer shows the resize sentence, or the lock", () => {
    expect(text).not.toContain("Your screenshot is resized on this phone");
    expect(text).not.toContain("PNG or JPEG.");
    expect(html).not.toContain("lock");
  });

  it("keeps the stepper's screen: heading, lead, zone, and the button", () => {
    expect(text).toContain("Add your screenshot");
    expect(text).toContain("The SMS or UPI app screen that shows the money leaving your account.");
    expect(text).toContain("Tap to add screenshot");
    expect(text).toContain("Upload and continue");
  });

  it("still tells the person what to choose when they choose wrongly", () => {
    // The format hint went with the row; the rejection message still says it.
    const source = readFileSync(new URL("../image.js", import.meta.url), "utf8");
    expect(source).toContain("Please choose a PNG or JPEG screenshot.");
  });

  it("leaves the same fact on the privacy page, in that page's own words", () => {
    const privacy = words(render(h(Privacy, { onBack: noop })));
    expect(privacy).toContain(
      "Your screenshot is resized on your phone and its location data removed before it is uploaded.",
    );
  });
});

describe("the masthead", () => {
  it("has no subline anywhere in the source", () => {
    const dir = new URL("../", import.meta.url);
    const files = readdirSync(dir, { recursive: true })
      .filter((f) => /\.(jsx?|css)$/.test(f) && !String(f).includes("__tests__"));
    for (const file of files) {
      const text = readFileSync(new URL(file, dir), "utf8");
      expect(text, String(file)).not.toContain("Steady steps after an online payment fraud");
      expect(text, String(file)).not.toContain("brand-sub");
    }
  });
});

describe("the plan: the 1930 hint is the script block's first line", () => {
  const PLAN = {
    path: "unauthorised", notSure: false, clocks: { goldenHour: { minutesLeft: 30, expired: false } },
    steps: [], script: { en: "My name is [your name].", hi: "मेरा नाम है।" }, disclaimers: [],
  };
  const html = render(h(PlanView, {
    caseId: "abcdefghijklmnopqrstuv", plan: PLAN, fields: pickFields({}),
    reminders: null, remindersUi: { busy: false, error: null },
    family: { sendsRemaining: 3, sent: false }, familyUi: { busy: false, error: null },
    demoMode: false, confirmRestart: false, confirmDelete: false, deleteUi: { busy: false, error: null },
    onEnrol: noop, onShare: noop, onRestartRequest: noop, onRestartCancel: noop, onRestart: noop,
    onDeleteRequest: noop, onDeleteCancel: noop, onDelete: noop,
  }));
  const HINT = "1930 is the national cyber crime helpline. Read the script below to them.";

  it("says it once, verbatim, inside the script block, before the tabs", () => {
    expect(words(html).split(HINT)).toHaveLength(2);
    const block = html.slice(html.indexOf('class="script-block"'));
    expect(block.indexOf(HINT)).toBeGreaterThan(block.indexOf("Your call script"));
    expect(block.indexOf(HINT)).toBeLessThan(block.indexOf('role="tablist"'));
  });

  it("is no longer between the golden-hour line and the script", () => {
    const hero = html.slice(html.indexOf('id="now"'), html.indexOf('class="script-block"'));
    expect(words(hero)).not.toContain("helpline");
  });
});

describe("every legal sentence is still reachable", () => {
  // The whole list, in one place: where each one is now.
  const homes = [
    ["Thaam is not a government service and is not affiliated with I4C, NCRP, RBI or any bank.", "About Thaam"],
    ["This is guidance, not legal advice.", "About Thaam"],
    ["Deadlines are estimated; act before the dates shown.", "About Thaam"],
    ["Thaam never files anything for you. You stay in control.", "About Thaam"],
    ["Not a bank, not the police, not the government.", "About Thaam"],
    ["Delete your case any time, in one tap.", "About Thaam"],
    ["It never files a complaint for you. You stay in control of every step.", "Consent fold"],
    ["It is not a government service, not the police and not your bank.", "Consent fold"],
    ["It gives guidance, not legal advice.", "Consent fold"],
    ["It cannot tell you whether a message is a scam.", "Consent fold"],
    ["Your screenshot, to read the payment details. Deleted after 7 days.", "Consent fold"],
    ["Those details and your action plan. Deleted after 90 days.", "Consent fold"],
  ];
  const where = {
    "About Thaam": words(render(h(Footer, { onOpenPrivacy: noop }))),
    "Consent fold": words(render(h(Consent, { consent: false, onToggle: noop, onContinue: noop }))),
  };

  it.each(homes)("%s -> %s", (sentence, home) => {
    expect(where[home]).toContain(sentence);
  });
});

describe("App: sibling keys", () => {
  it("never gives two siblings the same key (React then fails to remove the old one)", () => {
    // Found in the browser, not by a unit test: <main key={screen}> and
    // <Footer key={screen}> shared a key, and every old <main> stayed in the
    // page beside the new one. App is not rendered by this suite, so the keys
    // are read from its source instead.
    const source = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
    const keys = [...source.matchAll(/<(?:main|Footer|header)\b[^>]*\bkey=\{([^}]+)\}/g)].map(([, k]) => k);
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
