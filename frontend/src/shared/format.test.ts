import { describe, expect, it } from "vitest";
import { addDays, dateLabel, euros, validDate } from "./format";
import { bookingSchema, guestSchema, staySchema } from "./schemas";

describe("property dates and form boundaries", () => {
  it("rejects impossible and incomplete dates and supports leap days", () => {
    for (const value of [
      "2026-02-29",
      "2026-04-31",
      "2026-1-01",
      "0999-12-31",
      "2026-11-06T00:00:00Z",
    ])
      expect(validDate(value)).toBe(false);
    expect(validDate("2028-02-29")).toBe(true);
    expect(dateLabel("2026-10-25")).toBe("25 Oct 2026");
    expect(dateLabel(new Date("2026-10-25T00:00:00Z"))).toBe("25 Oct 2026");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
  });
  it("validates the stay before querying or submitting", () => {
    expect(
      staySchema.safeParse({
        startDate: "2026-11-06",
        endDate: "2026-11-06",
        guestCount: 1,
      }).success,
    ).toBe(false);
    expect(
      staySchema.safeParse({
        startDate: "2026-11-06",
        endDate: "2026-11-09",
        guestCount: 0,
      }).success,
    ).toBe(false);
    expect(
      bookingSchema.safeParse({
        startDate: "2026-11-06",
        endDate: "2026-11-09",
        guestCount: 1,
        customerId: "",
        guestLabel: "Typed but unselected",
        roomId: "7",
      }).success,
    ).toBe(false);
    expect(
      guestSchema.safeParse({
        firstName: "  ",
        lastName: "Guest",
        phone: "000",
        address: "Synthetic",
      }).success,
    ).toBe(false);
  });
  it("formats integer cents without treating legacy fixture prices as rates", () => {
    expect(euros(12345)).toBe("€123.45");
    expect(euros(1)).toBe("€0.01");
    expect(euros(-1)).toBe("-€0.01");
    expect(euros(Number.MAX_SAFE_INTEGER)).toBe("€90,071,992,547,409.91");
    expect(() => euros(1.2)).toThrow("Invalid money amount");
  });
});
