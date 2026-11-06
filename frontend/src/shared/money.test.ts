import { describe, expect, it } from "vitest";
import { euroInput, parseEuroCents } from "./money";
import {
  confirmedRates,
  matchesRateInput,
  rateSchema,
} from "../features/rooms/rateFields";

describe("exact EUR entry", () => {
  it("parses decimal points or commas into exact cents without floating point multiplication", () => {
    expect(parseEuroCents("50.01")).toBe(5001);
    expect(parseEuroCents(" 50,01 ")).toBe(5001);
    expect(parseEuroCents("0.29")).toBe(29);
    expect(parseEuroCents("001.2")).toBe(120);
    expect(parseEuroCents("50")).toBe(5000);
    expect(parseEuroCents("90071992547409.91")).toBe(Number.MAX_SAFE_INTEGER);
    expect(euroInput(Number.MAX_SAFE_INTEGER)).toBe("90071992547409.91");
    expect(euroInput(29)).toBe("0.29");
    expect(euroInput(null)).toBe("");
    expect(euroInput(undefined)).toBe("");
  });
  it.each([
    "",
    "0",
    "-1",
    "+1",
    "0.001",
    "1e2",
    "NaN",
    "1,000.00",
    "90071992547409.92",
    "1".repeat(33),
  ])("rejects unsupported price entry %s", (value) => {
    expect(parseEuroCents(value)).toBeNull();
  });
  it("rejects malformed saved amounts rather than formatting a false price", () => {
    expect(() => euroInput(0)).toThrow();
    expect(() => euroInput(0.5)).toThrow();
    expect(() => euroInput(Infinity)).toThrow();
  });
});

describe("room rate boundaries", () => {
  const data = {
    roomId: 7,
    currency: "EUR",
    baseNightlyCents: 5001,
    version: 1,
    seasons: [
      {
        name: "Лето",
        startDate: "2030-07-01",
        endDate: "2030-09-01",
        nightlyCents: 7501,
      },
    ],
  };
  it("distinguishes an explicit unconfigured state from malformed money results", () => {
    expect(
      confirmedRates(
        { ...data, baseNightlyCents: null, version: 0, seasons: [] },
        7,
      ).baseNightlyCents,
    ).toBeNull();
    for (const change of [
      { roomId: 8 },
      { version: -1 },
      { currency: "USD" },
      { baseNightlyCents: 0 },
      { baseNightlyCents: null },
      { seasons: null },
      { seasons: [null] },
      { version: 0 },
    ])
      expect(() => confirmedRates({ ...data, ...change }, 7)).toThrow(
        "could not be confirmed",
      );
  });
  it("validates seasonal overlaps and the exact saved input before acknowledging a write", () => {
    const values = {
      base: "50.01",
      seasons: [
        {
          name: "Лето",
          startDate: "2030-07-01",
          endDate: "2030-09-01",
          price: "75,01",
        },
      ],
    };
    expect(rateSchema.safeParse(values).success).toBe(true);
    expect(matchesRateInput(confirmedRates(data, 7), values)).toBe(true);
    expect(
      matchesRateInput(
        confirmedRates({ ...data, baseNightlyCents: 5002 }, 7),
        values,
      ),
    ).toBe(false);
    expect(
      rateSchema.safeParse({
        ...values,
        seasons: [...values.seasons, ...values.seasons],
      }).success,
    ).toBe(false);
    expect(() =>
      confirmedRates(
        { ...data, seasons: [...data.seasons, ...data.seasons] },
        7,
      ),
    ).toThrow();
  });
});
