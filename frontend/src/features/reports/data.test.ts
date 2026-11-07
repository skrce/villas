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
  report.charges[0].quoteId = null;
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

it("rejects a fabricated known balance when the accepted agreement is unknown", () => {
  const r = reportFixture("BALANCES");
  r.balances = [
    {
      ...balance(),
      agreedCents: null,
      accommodationCents: 0,
      outstandingCents: 0,
      creditCents: 1000,
    },
  ];
  r.totals.outstandingCents = 0;
  r.totals.knownCreditCents = 1000;
  r.totals.creditCents = 1000;
  expect(reportSchema.safeParse(r).success).toBe(false);
});
it("rejects a cancelled booking that still claims an accommodation debt", () => {
  const r = reportFixture("BALANCES");
  r.balances = [{ ...balance(), phase: "CANCELLED" }];
  r.totals.knownOutstandingCents = 14003;
  r.totals.outstandingCents = 14003;
  r.totals.creditCents = 0;
  expect(reportSchema.safeParse(r).success).toBe(false);
});
it("rejects a bookkeeping reversal counted as collected money", () => {
  const r = reportFixture("COLLECTIONS");
  r.collections = [
    {
      entryId: "9007199254740993",
      reservationId: 11,
      guestName: "Synthetic",
      kind: "REVERSAL",
      method: null,
      effectiveDate: "2026-11-07",
      recordedAt: "2026-11-07T10:00:00Z",
      amountCents: 500,
      reference: null,
      paymentId: null,
      reversesId: "9007199254740992",
      reversedById: null,
      collectedCents: 500,
      refundedCents: 0,
    },
  ];
  r.totals.collectedCents = 500;
  r.totals.netCollectedCents = 500;
  expect(reportSchema.safeParse(r).success).toBe(false);
});

it.each([
  [
    "cancelled accommodation charged",
    (r: ReturnType<typeof chargedReport>) => {
      r.charges[0].phase = "CANCELLED";
    },
  ],
  [
    "known amount without an accepted quote",
    (r: ReturnType<typeof chargedReport>) => {
      r.charges[0].quoteId = null;
    },
  ],
  [
    "night count that disagrees with source dates",
    (r: ReturnType<typeof chargedReport>) => {
      r.charges[0].nights = 4;
    },
  ],
  [
    "source dates outside the selected period",
    (r: ReturnType<typeof chargedReport>) => {
      r.charges[0].startDate = "2026-12-07";
      r.charges[0].endDate = "2026-12-10";
    },
  ],
  [
    "source room outside the selected room",
    (r: ReturnType<typeof chargedReport>) => {
      r.roomId = 8;
    },
  ],
] as const)("rejects charge sources with %s", (_label, change) => {
  const r = chargedReport();
  change(r);
  expect(reportSchema.safeParse(r).success).toBe(false);
});
it("rejects collections whose effective dates are outside their report period", () => {
  const r = reportFixture("COLLECTIONS");
  r.collections = [
    {
      entryId: "9007199254740993",
      reservationId: 11,
      guestName: "Synthetic",
      kind: "PAYMENT",
      method: "CASH",
      effectiveDate: "2026-12-07",
      recordedAt: "2026-12-07T10:00:00Z",
      amountCents: 500,
      reference: null,
      paymentId: null,
      reversesId: null,
      reversedById: null,
      collectedCents: 500,
      refundedCents: 0,
    },
  ];
  r.totals.collectedCents = 500;
  r.totals.netCollectedCents = 500;
  expect(reportSchema.safeParse(r).success).toBe(false);
});
it("rejects current-roster capacity that omits selected period nights", () => {
  const r = reportFixture("OCCUPANCY");
  r.occupancy = [
    {
      roomId: 7,
      roomName: "Synthetic",
      roomReference: "SYN-7",
      active: true,
      roomNights: 1,
      blockedNights: 0,
      sellableNights: 1,
      bookedNights: 1,
    },
  ];
  r.totals.roomNights = 1;
  r.totals.sellableNights = 1;
  r.totals.bookedNights = 1;
  expect(reportSchema.safeParse(r).success).toBe(false);
});
it("keeps an explicitly disclosed occupancy conflict visible without rejecting its source counts", () => {
  const r = reportFixture("OCCUPANCY");
  r.occupancy = [
    {
      roomId: 7,
      roomName: "Synthetic",
      roomReference: "SYN-7",
      active: true,
      roomNights: 3,
      blockedNights: 1,
      sellableNights: 2,
      bookedNights: 3,
    },
  ];
  r.totals.roomNights = 3;
  r.totals.blockedNights = 1;
  r.totals.sellableNights = 2;
  r.totals.bookedNights = 3;
  r.notices = ["CURRENT_INVENTORY_BASIS", "INVENTORY_CONFLICT"];
  expect(reportSchema.safeParse(r).success).toBe(true);
});

it("rejects duplicate charge intervals that inflate otherwise reconciled totals", () => {
  const r = chargedReport();
  r.charges.push({ ...r.charges[0] });
  r.totals.chargeCents = 30006;
  r.totals.knownChargeCents = 30006;
  expect(reportSchema.safeParse(r).success).toBe(false);
});
it("rejects overlapping room charge intervals for one booking", () => {
  const r = chargedReport();
  const row = r.charges[0];
  r.charges = [
    { ...row, endDate: "2026-11-09", nights: 2, chargeCents: 10002 },
    {
      ...row,
      roomId: 8,
      roomName: "Synthetic second room",
      roomReference: "SYN-8",
      startDate: "2026-11-08",
      nights: 2,
      chargeCents: 10002,
    },
  ];
  r.totals.chargeCents = 20004;
  r.totals.knownChargeCents = 20004;
  expect(reportSchema.safeParse(r).success).toBe(false);
});
it("accepts adjacent whole-stay charge intervals after a room move", () => {
  const r = chargedReport();
  const row = r.charges[0];
  r.charges = [
    { ...row, endDate: "2026-11-08", nights: 1, chargeCents: 5001 },
    {
      ...row,
      roomId: 8,
      roomName: "Synthetic second room",
      roomReference: "SYN-8",
      startDate: "2026-11-08",
      nights: 2,
      chargeCents: 10002,
    },
  ];
  expect(reportSchema.safeParse(r).success).toBe(true);
});

it("accepts separated intervals in a room-filtered report after a guest moved away and back", () => {
  const r = chargedReport();
  const row = r.charges[0];
  r.roomId = 7;
  r.charges = [
    { ...row, endDate: "2026-11-08", nights: 1, chargeCents: 5001 },
    { ...row, startDate: "2026-11-09", nights: 1, chargeCents: 5001 },
  ];
  r.totals.chargeCents = 10002;
  r.totals.knownChargeCents = 10002;
  expect(reportSchema.safeParse(r).success).toBe(true);
});
it.each(["quoteId", "phase", "guestName"] as const)(
  "rejects inconsistent %s across one booking's charge intervals",
  (field) => {
    const r = chargedReport();
    const row = r.charges[0];
    r.charges = [
      { ...row, endDate: "2026-11-08", nights: 1, chargeCents: 5001 },
      { ...row, startDate: "2026-11-08", nights: 2, chargeCents: 10002 },
    ];
    r.charges[1][field] =
      field === "quoteId"
        ? "00000000-0000-0000-0000-000000000012"
        : field === "phase"
          ? "CHECKED_IN"
          : "Different synthetic guest";
    expect(reportSchema.safeParse(r).success).toBe(false);
  },
);
