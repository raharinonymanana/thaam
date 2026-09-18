import { describe, expect, it } from "vitest";
import { ACCEPTED_TYPES, isAcceptedType, MAX_EDGE, targetSize } from "../image";

describe("targetSize", () => {
  it("leaves an image that already fits alone", () => {
    expect(targetSize(1080, 2400)).toEqual({ width: 1080, height: 2400 });
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("never upscales", () => {
    expect(targetSize(320, 480)).toEqual({ width: 320, height: 480 });
    expect(targetSize(10, 10)).toEqual({ width: 10, height: 10 });
  });

  it("caps the long edge of a tall screenshot", () => {
    // A typical phone screenshot: 1440 x 3200.
    expect(targetSize(1440, 3200)).toEqual({ width: 1080, height: 2400 });
  });

  it("caps the long edge of a wide photo", () => {
    expect(targetSize(4032, 3024)).toEqual({ width: 2400, height: 1800 });
  });

  it("keeps a square square", () => {
    expect(targetSize(3000, 3000)).toEqual({ width: 2400, height: 2400 });
  });

  it("puts the cap on the long edge, whichever it is", () => {
    const portrait = targetSize(1000, 5000);
    const landscape = targetSize(5000, 1000);
    expect(Math.max(portrait.width, portrait.height)).toBe(MAX_EDGE);
    expect(Math.max(landscape.width, landscape.height)).toBe(MAX_EDGE);
    expect(portrait).toEqual({ width: 480, height: 2400 });
    expect(landscape).toEqual({ width: 2400, height: 480 });
  });

  it("rounds to whole pixels and never to zero", () => {
    const thin = targetSize(3, 9000);
    expect(Number.isInteger(thin.width)).toBe(true);
    expect(Number.isInteger(thin.height)).toBe(true);
    expect(thin.width).toBeGreaterThanOrEqual(1);
    expect(thin).toEqual({ width: 1, height: 2400 });
  });

  it("honours a smaller cap, for the shrink-further fallback", () => {
    expect(targetSize(1440, 3200, 1000)).toEqual({ width: 450, height: 1000 });
    expect(targetSize(400, 300, 1000)).toEqual({ width: 400, height: 300 });
  });

  it("refuses dimensions that cannot be an image", () => {
    for (const [w, h] of [[0, 100], [100, 0], [-5, 5], [NaN, 10], [10, Infinity], [10, undefined]]) {
      expect(() => targetSize(w, h)).toThrow(/positive finite/);
    }
  });
});

describe("isAcceptedType", () => {
  it("accepts only PNG and JPEG", () => {
    expect(ACCEPTED_TYPES).toEqual(["image/png", "image/jpeg"]);
    expect(isAcceptedType("image/png")).toBe(true);
    expect(isAcceptedType("image/jpeg")).toBe(true);
  });

  it("rejects anything else, including look-alikes", () => {
    for (const type of ["image/jpg", "image/heic", "image/webp", "application/pdf",
      "image/svg+xml", "", undefined, null, "IMAGE/PNG"]) {
      expect(isAcceptedType(type)).toBe(false);
    }
  });
});
