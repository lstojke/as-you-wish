import { describe, expect, it } from "vitest";
import { reserveErrorPayload } from "./reservations";

describe("reserveErrorPayload", () => {
  it("maps a Postgres 23505 unique violation to a CONFLICT", () => {
    expect(reserveErrorPayload({ code: "23505" })).toEqual({
      code: "CONFLICT",
      message: "Someone just reserved this item first",
    });
  });

  it("maps a generic error to INTERNAL_SERVER_ERROR", () => {
    expect(reserveErrorPayload(new Error("boom"))).toEqual({
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not reserve item",
    });
  });

  it("maps a non-23505 Postgres error code to INTERNAL_SERVER_ERROR", () => {
    expect(reserveErrorPayload({ code: "23503" })).toEqual({
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not reserve item",
    });
  });

  it("maps null/undefined to INTERNAL_SERVER_ERROR", () => {
    expect(reserveErrorPayload(null).code).toBe("INTERNAL_SERVER_ERROR");
    expect(reserveErrorPayload(undefined).code).toBe("INTERNAL_SERVER_ERROR");
  });
});
