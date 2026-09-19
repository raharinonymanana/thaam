// H6: light by default, dark only by the toggle. Pure checks, node env: the
// switch is one function, and "the OS setting is never read" is asserted on the
// stylesheet and the sources as text, since there is no browser here.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { nextTheme, THEME_COLORS } from "../theme";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
// Code only: the comments in these files are allowed to talk about what they avoid.
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("nextTheme", () => {
  it("flips light to dark and back", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
    expect(nextTheme(nextTheme("light"))).toBe("light");
  });
});

describe("light by default", () => {
  const css = read("../index.css");

  it("the stylesheet no longer contains prefers-color-scheme: dark", () => {
    expect(css).not.toContain("prefers-color-scheme: dark");
    expect(css).not.toContain("prefers-color-scheme");
  });

  it("the dark tokens live under :root[data-theme=\"dark\"] only", () => {
    expect(css).toMatch(/:root\[data-theme="dark"\]\s*\{\s*color-scheme: dark;/);
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme: light;/);
  });

  it("nothing in the app reads the OS setting or stores the choice", () => {
    for (const file of ["../App.jsx", "../theme.js", "../main.jsx"]) {
      const source = code(file);
      expect(source).not.toMatch(/prefers-color-scheme|matchMedia/);
      expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
    }
  });

  it("index.html has one theme-color meta, the light page colour, no media query", () => {
    const html = read("../../index.html");
    const metas = html.match(/<meta name="theme-color"[^>]*>/g);
    expect(metas).toHaveLength(1);
    expect(metas[0]).toContain(THEME_COLORS.light);
    expect(metas[0]).not.toContain("media=");
  });
});
