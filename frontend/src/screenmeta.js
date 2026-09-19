// Two small facts about a screen the app needs outside the screen itself: what
// the browser tab should say, and which way the page should move to reach it.
import { SCREENS } from "./state";

export const HOME_TITLE = "Thaam — help after a UPI fraud";

/** The tab title (WCAG 2.4.2): the screen's own heading, then the name.
 *
 * Built from the heading text, which is the same for everyone and holds no case
 * detail - so nothing about a person's case, and never its ID, can end up in a
 * title, a tab list or the browser history. The welcome screen keeps the
 * sentence the page was published with. */
export function pageTitle(screen, heading) {
  const text = typeof heading === "string" ? heading.trim() : "";
  return screen === "welcome" || !text ? HOME_TITLE : `${text} · Thaam`;
}

/** How the page moves into `next`: "forward" and "back" follow the order of the
 * flow; "fade" is for moves that are not a step along it - the privacy page (a
 * detour, in and out), starting again, and the very first screen. */
export function screenDirection(prev, next) {
  if (!prev || prev === next) return "fade";
  if (prev === "privacy" || next === "privacy" || next === "welcome") return "fade";
  const from = SCREENS.indexOf(prev);
  const to = SCREENS.indexOf(next);
  if (from < 0 || to < 0) return "fade";
  return to > from ? "forward" : "back";
}
