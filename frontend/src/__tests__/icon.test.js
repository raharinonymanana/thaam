// The icon set is pasted path data, not a package, so nothing checks it at
// install time. These are the two ways it can quietly break: a name the app
// asks for that was never pasted in, and an entry whose path data is empty -
// both render an invisible nothing rather than an error.
//
// DOM-free, like the rest of the suite: the map is asserted directly, and the
// unknown-name case is a plain function call that returns null before React
// would ever need a document.
import { describe, expect, it } from "vitest";
import Icon, { ICONS } from "../components/Icon";

// Exactly the set D131 chose; adding one here is deliberate, not accidental.
const NAMES = [
  "phone", "check", "circle-check", "shield-check", "scale", "trash-2",
  "image-plus", "camera", "lock-keyhole", "clock", "bell", "users",
  "file-text", "copy", "chevron-down", "arrow-left", "circle-alert",
];

describe("the icon map", () => {
  it("has all seventeen names", () => {
    expect(Object.keys(ICONS).sort()).toEqual([...NAMES].sort());
  });

  it.each(NAMES)("%s has non-empty path data", (name) => {
    const paths = ICONS[name];
    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThan(0);
    for (const d of paths) {
      expect(typeof d).toBe("string");
      expect(d.trim().length).toBeGreaterThan(0);
      // Every path command starts at a point, so "M" or "m" must be there.
      expect(d).toMatch(/^[Mm]/);
    }
  });

  it("draws nothing for a name it does not know", () => {
    expect(Icon({ name: "not-an-icon" })).toBe(null);
    expect(Icon({})).toBe(null);
  });
});
