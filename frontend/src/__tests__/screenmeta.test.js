// The tab title and the direction of the entry animation (H4). Both are pure,
// so they are tested on their own; the wiring in App is covered in the browser.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement as h } from "react";
import Deleted from "../screens/Deleted";
import Fields from "../screens/Fields";
import { HOME_TITLE, pageTitle, screenDirection } from "../screenmeta";
import { pickFields, SCREENS } from "../state";

describe("pageTitle (WCAG 2.4.2)", () => {
  it("keeps the published sentence on the welcome screen", () => {
    expect(HOME_TITLE).toBe("Thaam — help after a UPI fraud");
    expect(pageTitle("welcome", "Money left your account? We'll take this one step at a time."))
      .toBe("Thaam — help after a UPI fraud");
  });

  it.each([
    ["consent", "Before we start", "Before we start · Thaam"],
    ["upload", "Add your screenshot", "Add your screenshot · Thaam"],
    ["extracting", "Reading your screenshot…", "Reading your screenshot… · Thaam"],
    ["fields", "Check the details", "Check the details · Thaam"],
    ["triage", "One question", "One question · Thaam"],
    ["plan", "Your plan", "Your plan · Thaam"],
    ["privacy", "How Thaam handles your data", "How Thaam handles your data · Thaam"],
    ["deleted", "Your case is deleted", "Your case is deleted · Thaam"],
  ])("%s is its heading, then the name", (screen, heading, expected) => {
    expect(pageTitle(screen, heading)).toBe(expected);
  });

  it("trims the heading's own whitespace", () => {
    expect(pageTitle("plan", "  Your plan \n")).toBe("Your plan · Thaam");
  });

  it("falls back to the home title when there is no heading yet", () => {
    for (const none of [undefined, null, "", "   ", 42]) {
      expect(pageTitle("plan", none)).toBe(HOME_TITLE);
    }
  });

  it("is made of the heading and the name only - nothing else can get in", () => {
    // The function has no parameter a case detail could arrive through: whatever
    // the heading says is all there is. So a title cannot carry an ID or amount
    // unless a heading does, and no heading in the app does.
    expect(pageTitle.length).toBe(2);
    const title = pageTitle("case", "Your plan");
    expect(title).not.toMatch(/abcdefghijklmnopqrstuv|₹|\d{4,}/);
  });
});

describe("screenDirection", () => {
  it("goes forward along the flow", () => {
    const flow = ["welcome", "consent", "upload", "extracting", "fields", "triage", "plan"];
    for (let i = 1; i < flow.length; i++) {
      // welcome is the one screen everything else fades into, but going *to*
      // consent from it is a step forward.
      expect(screenDirection(flow[i - 1], flow[i]), `${flow[i - 1]} -> ${flow[i]}`).toBe("forward");
    }
  });

  it("goes back when the victim goes back", () => {
    expect(screenDirection("triage", "fields")).toBe("back");
    expect(screenDirection("fields", "upload")).toBe("back");
    expect(screenDirection("plan", "triage")).toBe("back");
  });

  it("fades for the privacy page, in and out, from anywhere", () => {
    for (const screen of SCREENS.filter((s) => s !== "privacy")) {
      expect(screenDirection(screen, "privacy"), `${screen} -> privacy`).toBe("fade");
      expect(screenDirection("privacy", screen), `privacy -> ${screen}`).toBe("fade");
    }
  });

  it("fades when starting again, from anywhere", () => {
    for (const screen of SCREENS.filter((s) => s !== "welcome")) {
      expect(screenDirection(screen, "welcome"), `${screen} -> welcome`).toBe("fade");
    }
  });

  it("fades on the very first screen, and when the screen has not changed", () => {
    expect(screenDirection(undefined, "welcome")).toBe("fade");
    expect(screenDirection(null, "case")).toBe("fade");
    expect(screenDirection("fields", "fields")).toBe("fade");
  });

  it("fades for a screen it does not know rather than guessing a direction", () => {
    expect(screenDirection("fields", "nowhere")).toBe("fade");
    expect(screenDirection("nowhere", "fields")).toBe("fade");
  });

  it("only ever answers with one of the three the stylesheet knows", () => {
    for (const from of [undefined, ...SCREENS]) {
      for (const to of SCREENS) {
        expect(["forward", "back", "fade"]).toContain(screenDirection(from, to));
      }
    }
  });

  it("is never the same in both directions for a pair on the flow", () => {
    expect(screenDirection("upload", "fields")).not.toBe(screenDirection("fields", "upload"));
  });
});

describe("the deleted screen (D137 end state)", () => {
  const html = renderToStaticMarkup(h(Deleted, { onRestart: () => {} }));
  const text = html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

  it("puts a 40px tick above the title, inside the first child", () => {
    expect(html).toMatch(/<div class="screen-head"><span class="screen-icon"><svg[^>]*width="40"[^>]*height="40"/);
    expect(html.indexOf("screen-icon")).toBeLessThan(html.indexOf("<h1"));
    // The icon is decoration: hidden from screen readers.
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("keeps its title and sentence, and adds one line before the button", () => {
    expect(text).toContain("Your case is deleted");
    expect(text).toContain("Your screenshot, details, plan and reminders have been removed.");
    expect(text).toContain("If you ever need Thaam again, it's here.");
    expect(text.indexOf("have been removed.")).toBeLessThan(text.indexOf("it's here."));
    expect(text.indexOf("it's here.")).toBeLessThan(text.indexOf("Start a new case"));
  });

  it("has one action: start a new case", () => {
    expect(html.match(/<button/g)).toHaveLength(1);
  });
});

describe("the details screen's action bar (H4)", () => {
  const html = renderToStaticMarkup(h(Fields, {
    file: null, fields: pickFields({}), fieldErrors: {}, focusField: null,
    missingFields: [], unreadable: false, busy: false, onChange: () => {}, onContinue: () => {},
  }));

  it("is a direct child of the card, outside the form, so no arrival delay can reach it", () => {
    const formEnd = html.indexOf("</form>");
    const bar = html.indexOf('<div class="action-bar">');
    expect(formEnd).toBeGreaterThan(-1);
    expect(bar).toBeGreaterThan(formEnd);
    expect(html.slice(formEnd)).toMatch(/^<\/form><div class="action-bar"><button/);
  });

  it("is still the form's submit button, by the form attribute", () => {
    expect(html).toContain('<form id="fields-form"');
    expect(html).toMatch(/<button type="submit" form="fields-form"/);
  });
});
