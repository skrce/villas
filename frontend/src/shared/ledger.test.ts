import { describe, expect, it } from "vitest";
import { ledgerSummarySchema } from "./ledger";

const summary = {
  reservation: {
    id: 42,
    customerId: 5,
    roomId: 7,
    version: 2,
    startDate: "2030-01-01",
    endDate: "2030-01-03",
    guestCount: 2,
    status: "ACTIVE",
    phase: "CONFIRMED",
    acceptedQuoteId: "11111111-1111-4111-8111-111111111111",
  },
  propertyDate: "2026-11-07",
  currency: "EUR",
  agreedCents: 10002,
  accommodationCents: 10002,
  outstandingCents: 7501,
  creditCents: 0,
  totals: { paymentsCents: 3002, refundsCents: 501, receivedCents: 2501 },
};
describe("financial summaries", () => {
  it("accepts exact partial funds and overpayments as visible credits", () => {
    expect(ledgerSummarySchema.parse(summary).outstandingCents).toBe(7501);
    expect(
      ledgerSummarySchema.parse({
        ...summary,
        outstandingCents: 0,
        creditCents: 100,
        totals: { paymentsCents: 10102, refundsCents: 0, receivedCents: 10102 },
      }).creditCents,
    ).toBe(100);
  });
  it.each(["CANCELLED", "NO_SHOW"])(
    "retains the price and funds as credit on %s",
    (phase) => {
      expect(
        ledgerSummarySchema.parse({
          ...summary,
          reservation: { ...summary.reservation, status: "CANCELLED", phase },
          accommodationCents: 0,
          outstandingCents: 0,
          creditCents: 2501,
        }).agreedCents,
      ).toBe(10002);
    },
  );
  it.each([
    { totals: { ...summary.totals, receivedCents: 2500 } },
    { creditCents: 1 },
    { outstandingCents: 7500 },
    { accommodationCents: 10000 },
    { agreedCents: 10002.5 },
    {
      totals: { ...summary.totals, paymentsCents: Number.MAX_SAFE_INTEGER + 1 },
    },
  ])("rejects malformed or inconsistent financial information %j", (patch) => {
    expect(
      ledgerSummarySchema.safeParse({ ...summary, ...patch }).success,
    ).toBe(false);
  });
  it("keeps historical prices and balances unknown when no quote was accepted", () => {
    const historical = {
      ...summary,
      reservation: { ...summary.reservation, acceptedQuoteId: null },
      agreedCents: null,
      accommodationCents: null,
      outstandingCents: null,
      creditCents: null,
    };
    expect(ledgerSummarySchema.parse(historical).outstandingCents).toBeNull();
    expect(
      ledgerSummarySchema.safeParse({ ...historical, outstandingCents: 0 })
        .success,
    ).toBe(false);
  });
});
