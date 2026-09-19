// The colour theme is a choice made for one visit, held in memory and nowhere
// else: no localStorage, no cookie, and prefers-color-scheme is never read. Every
// new visit or reload opens light (H6).

/** The phone status bar colour that matches each theme's --page. */
export const THEME_COLORS = { light: "#F2F5F3", dark: "#0E1817" };

/** How long the cross-fade class stays on <html>: the 200 ms fade plus a margin. */
export const FADE_MS = 250;

/** The theme a tap switches to. Anything that is not "dark" counts as light. */
export function nextTheme(theme) {
  return theme === "dark" ? "light" : "dark";
}

/** Puts a theme on the page: light is the absence of the attribute, so the
 * :root tokens apply untouched. Also keeps the status-bar colour in step. */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[theme === "dark" ? "dark" : "light"]);
}
