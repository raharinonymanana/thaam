// Scrolling to a part of the plan page without touching the address bar.
//
// The page's address is its only credential - #case=<id> - so a link to
// "#now" that really navigated would replace the fragment: the reopened case
// would restart itself (App reads a fragment change as "I am done with this
// case") and a bookmark would lose the plan. So these jumps scroll and move
// focus, and never change location.hash.

/** Smooth, unless the person has asked for less motion. */
export function scrollBehavior() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  } catch {
    return "auto";
  }
}

/** Scroll an element to the top (its scroll-margin keeps it clear of the jump
 * bar) and move focus to it, so a keyboard or screen reader follows the jump. */
export function scrollToId(id, block = "start") {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: scrollBehavior(), block });
  el.focus({ preventScroll: true });
  return true;
}
