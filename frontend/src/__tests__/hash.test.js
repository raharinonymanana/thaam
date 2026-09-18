import { describe, expect, it } from "vitest";
import { clearCaseHash, parseCaseHash, setCaseHash } from "../hash";

const VALID = "abcdefghijklmnopqrstuv";           // 22 chars, as the backend issues
const WITH_SYMBOLS = "ab-def_hijklmnopqrstuv";      // - and _ are in the alphabet

describe("parseCaseHash", () => {
  it("reads a valid case fragment", () => {
    expect(parseCaseHash(`#case=${VALID}`)).toBe(VALID);
    expect(parseCaseHash(`#case=${WITH_SYMBOLS}`)).toBe(WITH_SYMBOLS);
    expect(parseCaseHash("#case=A1_z-9BcDeFgHiJkLmNoPq")).toBe("A1_z-9BcDeFgHiJkLmNoPq");
  });

  it("rejects the wrong length", () => {
    expect(parseCaseHash(`#case=${VALID.slice(0, 21)}`)).toBeNull();
    expect(parseCaseHash(`#case=${VALID}x`)).toBeNull();
    expect(parseCaseHash("#case=")).toBeNull();
  });

  it("rejects characters outside the URL-safe alphabet", () => {
    for (const bad of ["+", "/", "=", ".", " ", "%20", "<", "'"]) {
      expect(parseCaseHash(`#case=${VALID.slice(0, 21)}${bad}`)).toBeNull();
    }
  });

  it("rejects a missing or malformed fragment", () => {
    for (const hash of ["", "#", "#plan", `#CASE=${VALID}`, `#case:${VALID}`,
      `case=${VALID}`, `#/case=${VALID}`, `#case=${VALID}&x=1`, `#x=1&case=${VALID}`]) {
      expect(parseCaseHash(hash)).toBeNull();
    }
  });

  it("rejects anything that is not a string", () => {
    for (const value of [null, undefined, 0, {}, [], true]) {
      expect(parseCaseHash(value)).toBeNull();
    }
  });
});

describe("setCaseHash and clearCaseHash", () => {
  function fakeWindow(pathname = "/", search = "") {
    const calls = [];
    globalThis.window = {
      location: { pathname, search, hash: "" },
      history: { replaceState: (_state, _title, url) => calls.push(url) },
    };
    return calls;
  }

  it("puts the case in the fragment", () => {
    const calls = fakeWindow();
    setCaseHash(VALID);
    expect(calls).toEqual([`/#case=${VALID}`]);
  });

  it("keeps ?demo=1 so the demo controls survive being given a case (D112)", () => {
    const calls = fakeWindow("/", "?demo=1");
    setCaseHash(VALID);
    expect(calls).toEqual([`/?demo=1#case=${VALID}`]);
  });

  it("keeps the whole query string, whatever is in it", () => {
    const calls = fakeWindow("/thaam/", "?demo=1&lang=hi");
    setCaseHash(VALID);
    expect(calls).toEqual([`/thaam/?demo=1&lang=hi#case=${VALID}`]);
  });

  it("clearing drops only the fragment, never the query", () => {
    const calls = fakeWindow("/", "?demo=1");
    clearCaseHash();
    expect(calls).toEqual(["/?demo=1"]);
    expect(parseCaseHash(calls[0])).toBeNull();
  });
});
