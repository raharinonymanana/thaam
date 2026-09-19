// The plan page's structure (H3), rendered to a string like the rest of the
// suite. Effects do not run in a static render, so this covers what is on the
// page and in what order; the timers, ticks and focus are covered by the pure
// functions in planview.test.js and by the browser pass.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement as h } from "react";
import PlanView from "../components/PlanView";
import Privacy from "../screens/Privacy";
import { pickFields } from "../state";

globalThis.window = { location: { hash: "", pathname: "/", search: "" }, history: {} };

const noop = () => {};
// 2026-09-19 14:00 IST, so the bank deadline below is "In 3 days".
const NOW = new Date("2026-09-19T14:00:00+05:30");

const FIELDS = pickFields({
  amount: "49999.00", txn_date: "2026-09-18", txn_time: "10:41:07", utr: "426173859012",
  account_masked: "XX1234", bank: "Sample Bank", payee_vpa: "refund.help99@okaxis",
});

const STEPS = {
  call_1930: { id: "call_1930", title: "Call 1930 now", detail: "Call the cyber crime helpline and read out the script below.", tel: "1930" },
  file_ncrp: { id: "file_ncrp", title: "File a complaint online", detail: "File on the National Cyber Crime Reporting Portal using the text Thaam prepares.", url: "https://cybercrime.gov.in" },
  keep_ack: { id: "keep_ack", title: "Keep the acknowledgement number", detail: "Write down the acknowledgement number you receive" },
  block_payments: { id: "block_payments", title: "Block your card or UPI", detail: "Ask your bank to block your card/UPI" },
  bank_letter: { id: "bank_letter", title: "Send a written complaint to your bank", detail: "Send the written complaint to your bank before 22 September 2026" },
  fir: { id: "fir", title: "File an FIR", detail: "File an FIR at your nearest police station with the acknowledgement number" },
  chakshu: { id: "chakshu", title: "Report the scammer's number", detail: "Report the scammer's number on Chakshu", url: "https://sancharsaathi.gov.in/sfc" },
};

const DISCLAIMERS = [
  "Thaam is not a government service and is not affiliated with I4C, NCRP, RBI or any bank.",
  "This is guidance, not legal advice.",
  "Deadlines are estimated; act before the dates shown.",
];

const UNAUTHORISED = {
  path: "unauthorised", notSure: false,
  clocks: {
    goldenHour: { minutesLeft: 30, expired: false },
    bankReport: { deadline: "2026-09-22T23:59:59+05:30" },
    limitedLiability: { until: "2026-09-28T23:59:59+05:30" },
    shadowCredit: { by: "2026-10-05T23:59:59+05:30" },
    resolution: { by: "2026-12-18T14:00:00+05:30" },
    ombudsman: { eligibleFrom: "2026-10-19T14:00:00+05:30", url: "https://cms.rbi.org.in" },
  },
  steps: ["call_1930", "file_ncrp", "keep_ack", "block_payments", "bank_letter"].map((id) => STEPS[id]),
  script: { en: "My name is [your name].", hi: "मेरा नाम [अपना नाम] है।" },
  disclaimers: DISCLAIMERS,
};

const AUTHORISED = {
  path: "authorised", notSure: true,
  clocks: {
    goldenHour: { minutesLeft: -5, expired: true, message: "Call 1930 anyway — money can still sometimes be frozen." },
    ombudsman: { eligibleFrom: "2026-10-19T14:00:00+05:30", url: "https://cms.rbi.org.in" },
  },
  steps: ["call_1930", "file_ncrp", "keep_ack", "block_payments", "fir", "chakshu"].map((id) => STEPS[id]),
  script: { en: "Hello.", hi: "नमस्ते।" },
  disclaimers: DISCLAIMERS,
};

const view = (plan, props = {}) => renderToStaticMarkup(h(PlanView, {
  caseId: "abcdefghijklmnopqrstuv", plan, fields: FIELDS, now: NOW,
  reminders: null, remindersUi: { busy: false, error: null },
  family: { sendsRemaining: 3, sent: false }, familyUi: { busy: false, error: null },
  demoMode: false, confirmRestart: false, confirmDelete: false,
  deleteUi: { busy: false, error: null },
  onEnrol: noop, onShare: noop, onRestartRequest: noop, onRestartCancel: noop, onRestart: noop,
  onDeleteRequest: noop, onDeleteCancel: noop, onDelete: noop,
  ...props,
}));

/** Visible words: tags gone, entities decoded, spacing collapsed. */
const words = (html) => html
  .replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();

const headings = (html) => [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map(([, t]) => words(t));

describe("the plan page, unauthorised path", () => {
  const html = view(UNAUTHORISED);
  const text = words(html);

  it("opens with the case summary as three pills", () => {
    const pills = [...html.matchAll(/<li class="pill">([^<]*)<\/li>/g)].map(([, t]) => t);
    expect(pills).toEqual(["₹ 49,999.00", "Fri 18 Sep", "UTR …9012"]);
  });

  it("no longer has the old lead sentence, or the old deadlines and steps cards", () => {
    expect(text).not.toContain("Start at the top. The first call matters most.");
    expect(headings(html)).not.toContain("Your deadlines");
    expect(headings(html)).not.toContain("Your steps");
  });

  it("has no second 'Call 1930 now' heading - the hero is not headed by it", () => {
    expect(headings(html)).not.toContain("Call 1930 now");
    expect(html).toContain('<p class="eyebrow">Now</p>');
    // The button is still there, once.
    expect(html.match(/class="button button-call"/g)).toHaveLength(1);
  });

  it("reads top to bottom: hero, checklist, dates, then the three folds", () => {
    expect(headings(html).filter((t) => [
      "Your call script", "Your checklist", "Dates to know",
    ].includes(t))).toEqual(["Your call script", "Your checklist", "Dates to know"]);
    const at = (needle) => html.indexOf(needle);
    expect(at('id="now"')).toBeLessThan(at('id="checklist"'));
    expect(at('id="checklist"')).toBeLessThan(at('id="dates"'));
    expect(at('id="dates"')).toBeLessThan(at('id="documents"'));
    expect(at('id="documents"')).toBeLessThan(at("Stay on track"));
    expect(at("Stay on track")).toBeLessThan(at('id="more"'));
  });

  it("groups the checklist Now / Today / This week", () => {
    expect([...html.matchAll(/<h3 class="group-heading">([^<]*)<\/h3>/g)].map(([, t]) => t))
      .toEqual(["Now", "Today", "This week"]);
  });

  it("gives the call step no detail - the hero is its instructions", () => {
    expect(text).not.toContain("Call the cyber crime helpline and read out the script below.");
    // Every other step keeps its detail.
    expect(text).toContain("Ask your bank to block your card/UPI");
    expect(text).toContain("Write down the acknowledgement number you receive");
  });

  it("names every tick box by its step's title, and starts them all unticked", () => {
    const boxes = [...html.matchAll(/<input id="(tick-[a-z_0-9]+)"[^>]*>/g)];
    expect(boxes).toHaveLength(5);
    for (const [tag, id] of boxes) {
      expect(tag).toContain('type="checkbox"');
      expect(tag).not.toContain("checked");
      const label = new RegExp(`<label[^>]*for="${id}"[^>]*>[\\s\\S]*?<span class="tick-title">([^<]*)</span>`)
        .exec(html);
      expect(label, id).toBeTruthy();
      expect(label[1].length).toBeGreaterThan(3);
    }
  });

  it("shows how many are done, as a progress bar with its numbers", () => {
    expect(text).toContain("0 of 5 done");
    const bar = /<div class="progress"[^>]*>/.exec(html)[0];
    expect(bar).toContain('role="progressbar"');
    expect(bar).toContain('aria-valuemin="0"');
    expect(bar).toContain('aria-valuemax="5"');
    expect(bar).toContain('aria-valuenow="0"');
    expect(bar).toContain('aria-label="Checklist progress"');
  });

  it("puts a deadline chip, in words, on the bank letter step only", () => {
    const chips = [...html.matchAll(/<p class="chip chip-(\w+)">(?:<svg[\s\S]*?<\/svg>)?([^<]*)<\/p>/g)];
    expect(chips.map(([, tone, label]) => [tone, label])).toEqual([["soon", "In 3 days · Tue 22 Sep"]]);
  });

  it("offers Copy complaint text and Copy bank letter, on those steps", () => {
    expect([...html.matchAll(/class="linkish step-action"[^>]*>([^<]*)</g)].map(([, t]) => t))
      .toEqual(["Copy complaint text", "Copy bank letter"]);
  });

  it("marks placeholders in the script", () => {
    expect(html).toContain('<mark class="ph">[your name]</mark>');
  });

  it("has the dates timeline: four rows, only the first coloured by urgency", () => {
    const rows = [...html.matchAll(/<li class="tl-row[^"]*">([\s\S]*?)<\/li>/g)].map(([, r]) => r);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => /<p class="tl-label">([^<]*)</.exec(r)[1])).toEqual([
      "Limited-liability window ends",
      "Bank should credit the amount back (shadow credit)",
      "You can complain to the RBI Ombudsman from",
      "Bank must resolve your complaint by",
    ]);
    // The bank's own clocks are never urgent, however close.
    for (const row of rows.slice(1)) expect(row).toContain("chip chip-later");
    expect(rows[3]).toContain("In 90 days");
    expect(rows[2]).toContain("Open the RBI complaint site");
    expect(text).toContain("estimated — act before this date");
    expect(text).toContain("estimated — the bank's deadline");
  });

  it("does not list the bank deadline in the timeline: it is on the checklist", () => {
    expect(text).not.toContain("Tell your bank in writing — for zero liability");
  });

  it("has three folds, all closed", () => {
    const folds = [...html.matchAll(/<details\b[^>]*>/g)].map(([tag]) => tag);
    expect(folds).toHaveLength(3);
    for (const tag of folds) expect(tag).not.toMatch(/\sopen(=|\s|>)/);
    expect(text).toContain("Documents to copy");
    expect(text).toContain("Stay on track");
    expect(text).toContain("Your case");
  });

  it("gives no fold a tabindex: it would take its summary out of the tab order", () => {
    // Found by tabbing through the page: a <details tabindex="-1"> is skipped
    // by Tab together with its <summary>, so the fold could not be opened from
    // the keyboard. Jumps focus the summary instead (see scrollTo.js).
    for (const [tag] of html.matchAll(/<details[^>]*>/g)) expect(tag).not.toMatch(/tabindex/i);
    for (const [tag] of html.matchAll(/<summary[^>]*>/g)) expect(tag).not.toMatch(/tabindex="-1"/);
  });

  it("still renders every fold's contents, so their inputs and labels exist", () => {
    expect(html).toContain('id="copy-ncrp"');
    expect(html).toContain('id="copy-letter"');
    expect(html).toContain('id="reminder-email"');
    expect(html).toContain('id="family-email"');
    expect(text).toContain("Keep this page");
    expect(text).toContain("Bookmark this page to come back to your plan.");
    expect(text).toContain("Delete my case now");
    expect(text).toContain("Start a new case");
  });

  it("puts Reminders before Share with family inside Stay on track", () => {
    expect(html.indexOf("<h2>Reminders</h2>")).toBeGreaterThan(-1);
    expect(html.indexOf("<h2>Reminders</h2>")).toBeLessThan(html.indexOf("<h2>Share with family</h2>"));
  });

  it("gives the fold summaries an icon, a title and a chevron", () => {
    const summaries = [...html.matchAll(/<summary class="fold-summary">([\s\S]*?)<\/summary>/g)];
    expect(summaries).toHaveLength(3);
    for (const [, inner] of summaries) {
      expect(inner.match(/<svg/g)).toHaveLength(2);
      expect(inner).toContain("fold-chevron");
    }
  });

  it("does not repeat the footer's disclaimers at the end of the page", () => {
    // The backend sends the same three lines the footer shows on every screen,
    // so the plan renders no list of its own: the footer carries them.
    expect(html).not.toContain("plan-disclaimers");
    for (const line of DISCLAIMERS) expect(text).not.toContain(line);
  });

  it("does still render a disclaimer the footer does not have, at the end", () => {
    const extra = view({ ...UNAUTHORISED, disclaimers: [...DISCLAIMERS, "A line only the plan has."] });
    expect(extra).toContain('<ul class="plan-disclaimers"><li>A line only the plan has.</li></ul>');
    expect(extra.indexOf("plan-disclaimers")).toBeGreaterThan(extra.indexOf('id="more"'));
    // ...and still not the three the footer has.
    for (const line of DISCLAIMERS) expect(words(extra)).not.toContain(line);
  });

  it("has a jump bar with four targets that all exist on the page", () => {
    const links = [...html.matchAll(/<a class="jump-pill" href="#(\w+)">([^<]*)<\/a>/g)];
    expect(links.map(([, , label]) => label)).toEqual(["Now", "Checklist", "Dates", "More"]);
    for (const [, id] of links) expect(html, id).toContain(`id="${id}"`);
  });

  it("announces a fresh plan, and only a fresh one", () => {
    expect(html).toContain('role="status"');
    expect(html).toContain("Your plan is ready");
    const back = view(UNAUTHORISED, { reopened: true });
    expect(back).not.toContain("Your plan is ready");
    expect(back).not.toContain("plan-ready");
  });

  it("has no not-sure notice when the victim was sure", () => {
    expect(text).not.toContain("You weren't sure");
  });
});

describe("the plan page, authorised path", () => {
  const html = view(AUTHORISED);
  const text = words(html);

  it("has FIR and Chakshu under This week, and no bank letter anywhere", () => {
    const week = html.slice(html.indexOf(">This week<"));
    expect(week).toContain("File an FIR");
    expect(week).toContain("Report the scammer&#x27;s number");
    expect(text).not.toContain("Send a written complaint to your bank");
    expect(html).not.toContain('id="copy-letter"');
    expect(text).not.toContain("Copy bank letter");
    expect(text).toContain("Copy complaint text");
  });

  it("has no deadline chip on the checklist, because no step is dated", () => {
    expect(html).not.toMatch(/<p class="chip chip-/);
  });

  it("has only the ombudsman date in the timeline, and never an invented one", () => {
    const rows = html.match(/<li class="tl-row/g);
    expect(rows).toHaveLength(1);
    expect(text).toContain("You can complain to the RBI Ombudsman from");
    expect(text).not.toContain("Limited-liability window ends");
    expect(text).not.toContain("Bank must resolve your complaint by");
  });

  it("shows the expired first-hour message the backend wrote", () => {
    expect(text).toContain("Call 1930 anyway — money can still sometimes be frozen.");
    expect(text).not.toContain("minutes left in the first hour");
  });

  it("puts the not-sure notice directly under the hero, unchanged", () => {
    const notice = html.indexOf("You weren&#x27;t sure");
    expect(notice).toBeGreaterThan(html.indexOf('id="now"'));
    expect(notice).toBeLessThan(html.indexOf('id="checklist"'));
    expect(text).toContain(
      "You weren't sure, so Thaam used the path with the most protection. Report to your bank quickly either way.",
    );
  });

  it("counts six steps", () => {
    expect(text).toContain("0 of 6 done");
  });
});

describe("the plan page with less to show", () => {
  it("omits summary pills it has no values for", () => {
    const html = view(UNAUTHORISED, { fields: pickFields({}) });
    expect(html).not.toContain("class=\"pills\"");
  });

  it("omits the checklist, progress and its jump when there are no steps", () => {
    const html = view({ ...UNAUTHORISED, steps: [] });
    expect(html).not.toContain('id="checklist"');
    expect(html).not.toContain("progress-text");
    expect(html).not.toContain('href="#checklist"');
  });

  it("omits the dates card and its jump when there are no dates", () => {
    const html = view({ ...UNAUTHORISED, clocks: { goldenHour: { minutesLeft: 5, expired: false } } });
    expect(html).not.toContain('id="dates"');
    expect(html).not.toContain('href="#dates"');
  });

  it("never drops a step it does not recognise", () => {
    const html = view({ ...UNAUTHORISED, steps: [...UNAUTHORISED.steps, { id: "new_thing", title: "Do the new thing", detail: "Details." }] });
    expect(words(html)).toContain("Do the new thing");
    expect(words(html)).toContain("0 of 6 done");
  });
});

describe("the privacy page", () => {
  const text = words(renderToStaticMarkup(h(Privacy, { onBack: noop })));

  it("says where ticks are kept, in the approved words", () => {
    expect(text).toContain(
      "Ticks on your checklist are saved only on this phone. Delete my case now clears them.",
    );
  });

  it("keeps the sentences it already had in the same section", () => {
    expect(text).toContain("“Delete my case now” on your plan removes everything immediately.");
    expect(text).toContain(
      "One honest exception: an older voice file from a previous version of your plan is removed automatically within 90 days.",
    );
    // The new sentence comes last in "You are in control".
    expect(text.indexOf("One honest exception")).toBeLessThan(text.indexOf("Ticks on your checklist"));
  });
});
