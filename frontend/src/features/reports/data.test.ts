import { expect, it } from "vitest";
import {
  chargedReport,
  reportFixture,
  todayFixture,
  balance,
} from "../../test/reporting";
import { reportSchema, todaySchema, validPeriod } from "./data";
it.each([
  ["2026-03-28", "2026-03-31", true],
  ["2026-10-24", "2026-10-27", true],
  ["2026-02-30", "2026-03-02", false],
  ["2026-01-01", "2026-01-01", false],
  ["2026-01-01", "2028-01-01", false],
])("validates calendar period %s to %s", (a, b, valid) =>
  expect(validPeriod(String(a), String(b))).toBe(valid),
);
it("reconciles saved charge source rows without hiding unknown prices", () => {
  const report = chargedReport();
  expect(reportSchema.safeParse(report).success).toBe(true);
  report.charges[0].chargeCents = null;
  expect(reportSchema.safeParse(report).success).toBe(false);
  report.totals.chargeCents = null;
  report.totals.knownChargeCents = 0;
  report.totals.unknownPriceCount = 1;
  expect(reportSchema.parse(report).totals.chargeCents).toBeNull();
});
it("rejects rounded cents and a total that does not match sources", () => {
  const report = chargedReport();
  report.totals.chargeCents = 9007199254740992;
  expect(reportSchema.safeParse(report).success).toBe(false);
  report.totals.chargeCents = 15004;
  expect(reportSchema.safeParse(report).success).toBe(false);
});
it("retains large decimal ledger IDs and a negative collection period", () => {
  const r = reportFixture("COLLECTIONS");
  r.collections.push({
    entryId: "9007199254740993",
    reservationId: 11,
    guestName: "Synthetic",
    kind: "REFUND",
    method: "CASH",
    effectiveDate: "2026-11-07",
    recordedAt: "2026-11-07T10:00:00Z",
    amountCents: 500,
    reference: null,
    paymentId: "9007199254740992",
    reversesId: null,
    reversedById: null,
    collectedCents: 0,
    refundedCents: 500,
  });
  r.totals.refundedCents = 500;
  r.totals.netCollectedCents = -500;
  expect(reportSchema.parse(r).collections[0].entryId).toBe("9007199254740993");
});
it("does not include archived-room nights in current-roster occupancy totals", () => {
  const r = reportFixture("OCCUPANCY");
  r.occupancy.push({
    roomId: 7,
    roomName: "Synthetic archived",
    roomReference: "SYN-7",
    active: false,
    roomNights: 0,
    blockedNights: 0,
    sellableNights: 0,
    bookedNights: 3,
  });
  expect(reportSchema.safeParse(r).success).toBe(true);
  r.totals.bookedNights = 3;
  expect(reportSchema.safeParse(r).success).toBe(false);
});
it("reconciles whole-booking current balances", () => {
  const r = reportFixture("BALANCES");
  r.balances = [balance()];
  r.totals.knownOutstandingCents = 14003;
  r.totals.outstandingCents = 14003;
  r.totals.creditCents = 0;
  expect(reportSchema.safeParse(r).success).toBe(true);
  r.balances[0].outstandingCents = 14004;
  expect(reportSchema.safeParse(r).success).toBe(false);
});
it("keeps complete Today counts separate from bounded examples", () => {
  const today = todayFixture();
  expect(todaySchema.parse(today).arrivals.count).toBe(7);
  today.activeRooms = 3;
  expect(todaySchema.safeParse(today).success).toBe(false);
});
