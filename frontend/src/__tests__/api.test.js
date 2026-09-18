import { describe, expect, it } from "vitest";
import { ApiError, apiErrorFrom, SERVER_MESSAGE, UNEXPECTED_MESSAGE } from "../api";

describe("apiErrorFrom", () => {
  it("uses the backend's own error, message and field", () => {
    const err = apiErrorFrom(400, {
      error: "invalid_field",
      field: "account_masked",
      message: "Enter only the last 4 digits of the account, e.g. XX1234.",
    });
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ApiError");
    expect(err.status).toBe(400);
    expect(err.code).toBe("invalid_field");
    expect(err.field).toBe("account_masked");
    expect(err.message).toBe("Enter only the last 4 digits of the account, e.g. XX1234.");
  });

  it("carries the codes the screens branch on", () => {
    expect(apiErrorFrom(422, { error: "unreadable", message: "x" }).code).toBe("unreadable");
    expect(apiErrorFrom(404, { error: "not_found", message: "Case not found." }).status).toBe(404);
    expect(apiErrorFrom(409, { error: "no_plan", message: "x" }).code).toBe("no_plan");
  });

  it("has no field unless the backend named one", () => {
    expect(apiErrorFrom(400, { error: "invalid_body", message: "x" }).field).toBeNull();
    expect(apiErrorFrom(400, { error: "e", message: "x", field: 42 }).field).toBeNull();
  });

  it("falls back for a body that is not the error shape", () => {
    for (const payload of [null, undefined, "<html>502</html>", [], 7]) {
      expect(apiErrorFrom(502, payload).message).toBe(SERVER_MESSAGE);
      expect(apiErrorFrom(400, payload).message).toBe(UNEXPECTED_MESSAGE);
    }
  });

  it("never shows an empty or non-string message", () => {
    expect(apiErrorFrom(400, { error: "e", message: "" }).message).toBe(UNEXPECTED_MESSAGE);
    expect(apiErrorFrom(400, { error: "e", message: "   " }).message).toBe(UNEXPECTED_MESSAGE);
    expect(apiErrorFrom(400, { error: "e", message: 42 }).message).toBe(UNEXPECTED_MESSAGE);
    expect(apiErrorFrom(500, {}).message).toBe(SERVER_MESSAGE);
  });

  it("trims the message and invents a code when there is none", () => {
    expect(apiErrorFrom(400, { message: "  Case ID is not valid.  " }).message)
      .toBe("Case ID is not valid.");
    expect(apiErrorFrom(503, null).code).toBe("http_503");
  });
});

describe("ApiError defaults", () => {
  it("is safe to construct with nothing", () => {
    const err = new ApiError();
    expect(err.status).toBe(0);
    expect(err.code).toBe("unknown");
    expect(err.message).toBe(UNEXPECTED_MESSAGE);
    expect(err.field).toBeNull();
  });
});
