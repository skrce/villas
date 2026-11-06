import { describe, expect, it } from "vitest";
import {
  acceptedPriceSchema,
  confirmedQuote,
  priceSchema,
  quoteSchema,
  refreshedQuote,
  stayIdentity,
} from "./pricing";

const input = {
  customerId: 5,
  roomId: 7,
  startDate: "2028-02-28",
  endDate: "2028-03-01",
  guestCount: 2,
};
const price = {
  currency: "EUR",
  rateVersion: 1,
  nights: 2,
  lines: [
    {
      name: "Base rate",
      startDate: input.startDate,
      endDate: input.endDate,
      nightlyCents: 5001,
      nights: 2,
      subtotalCents: 10002,
    },
  ],
  totalCents: 10002,
};
const quote = {
  id: "11111111-1111-4111-8111-111111111111",
  roomId: 7,
  startDate: input.startDate,
  endDate: input.endDate,
  guestCount: 2,
  createdAt: "2026-11-06T12:00:00Z",
  expiresAt: "2026-11-06T12:15:00Z",
  price,
};
describe("financial quote response validation", () => {
  it("retains an exact safe-integer maximum across multiple price lines", () => {
    const high = {
      currency: "EUR",
      rateVersion: 2,
      nights: 2,
      totalCents: Number.MAX_SAFE_INTEGER,
      lines: [
        {
          name: "One",
          startDate: "2028-02-28",
          endDate: "2028-02-29",
          nightlyCents: 4503599627370495,
          nights: 1,
          subtotalCents: 4503599627370495,
        },
        {
          name: "Two",
          startDate: "2028-02-29",
          endDate: "2028-03-01",
          nightlyCents: 4503599627370496,
          nights: 1,
          subtotalCents: 4503599627370496,
        },
      ],
    };
    expect(
      confirmedQuote({ ...quote, price: high }, input).price.totalCents,
    ).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("confirms exact prices, complete date coverage and server quote identity", () => {
    const saved = confirmedQuote(quote, input);
    expect(saved.price.totalCents).toBe(10002);
    expect(saved.expiresAt).toBeInstanceOf(Date);
    expect(
      quoteSchema.safeParse({
        ...quote,
        createdAt: new Date(quote.createdAt),
        expiresAt: new Date(quote.expiresAt),
      }).success,
    ).toBe(true);
    expect(stayIdentity(input)).toBe(stayIdentity({ ...input, guestCount: 2 }));
  });
  it.each([
    { totalCents: 0 },
    { totalCents: 10003 },
    { currency: "USD" },
    { nights: 3 },
    { rateVersion: -1 },
    { lines: [] },
    { lines: [{ ...price.lines[0], nightlyCents: 0.5 }] },
    { lines: [{ ...price.lines[0], subtotalCents: 10002.5 }] },
    { lines: [{ ...price.lines[0], nights: 1.5 }] },
    { lines: [{ ...price.lines[0], startDate: "2028-02-30" }] },
  ])(
    "rejects malformed or inconsistent money without an unsafe BigInt conversion %#",
    (change) => {
      expect(() =>
        quoteSchema.safeParse({ ...quote, price: { ...price, ...change } }),
      ).not.toThrow();
      expect(
        quoteSchema.safeParse({ ...quote, price: { ...price, ...change } })
          .success,
      ).toBe(false);
    },
  );
  it("rejects another room/period/party and expired response shapes rather than retargeting a quote", () => {
    for (const change of [
      { roomId: 8 },
      { startDate: "2028-02-27" },
      { guestCount: 3 },
    ])
      expect(() => confirmedQuote({ ...quote, ...change }, input)).toThrow(
        "could not be confirmed",
      );
    expect(
      quoteSchema.safeParse({ ...quote, expiresAt: quote.createdAt }).success,
    ).toBe(false);
    expect(quoteSchema.safeParse({ ...quote, id: "not-a-quote" }).success).toBe(
      false,
    );
  });
  it("requires contiguous lines and exactly matching subtotals", () => {
    const split = {
      ...price,
      lines: [
        {
          name: "Base rate",
          startDate: "2028-02-28",
          endDate: "2028-02-29",
          nightlyCents: 5001,
          nights: 1,
          subtotalCents: 5001,
        },
        {
          name: "Season",
          startDate: "2028-02-29",
          endDate: "2028-03-01",
          nightlyCents: 5001,
          nights: 1,
          subtotalCents: 5001,
        },
      ],
    };
    expect(priceSchema.safeParse(split).success).toBe(true);
    expect(
      priceSchema.safeParse({
        ...split,
        lines: [split.lines[0], split.lines[0]],
      }).success,
    ).toBe(false);
  });
  it("only adopts a valid explicitly refreshed offer for the unchanged stay", () => {
    expect(
      refreshedQuote({ code: "QUOTE_CHANGED", replacementQuote: quote }, input)
        ?.id,
    ).toBe(quote.id);
    expect(
      refreshedQuote(
        { code: "QUOTE_CHANGED", replacementQuote: quote },
        { ...input, roomId: 8 },
      ),
    ).toBeUndefined();
    expect(
      refreshedQuote({ code: "OTHER", replacementQuote: quote }, input),
    ).toBeUndefined();
    expect(refreshedQuote(null, input)).toBeUndefined();
    expect(
      acceptedPriceSchema.safeParse({
        reservationId: 42,
        reservationVersion: 0,
        acceptedAt: quote.createdAt,
        quote,
      }).success,
    ).toBe(true);
  });
});
