import type { Kind } from "../features/reports/data";
export const totals = () => ({
  roomNights: 0,
  blockedNights: 0,
  sellableNights: 0,
  bookedNights: 0,
  knownChargeCents: 0,
  chargeCents: null as number | null,
  collectedCents: 0,
  refundedCents: 0,
  netCollectedCents: 0,
  knownOutstandingCents: 0,
  outstandingCents: null as number | null,
  knownCreditCents: 0,
  creditCents: null as number | null,
  unknownPriceCount: 0,
});
export const balance = () => ({
  reservationId: 11,
  guestName: "Synthetic Гост",
  phase: "CONFIRMED",
  startDate: "2026-11-07",
  endDate: "2026-11-10",
  agreedCents: 15003 as number | null,
  accommodationCents: 15003,
  receivedCents: 1000,
  outstandingCents: 14003 as number | null,
  creditCents: 0 as number | null,
});
export const reportFixture = (kind: Kind = "CHARGES") => ({
  kind,
  startDate: "2026-11-07",
  endDate: "2026-11-10",
  propertyDate: "2026-11-07",
  roomId: null as number | null,
  snapshotId: "a".repeat(64),
  totals: totals(),
  occupancy: [] as {
    roomId: number;
    roomName: string;
    roomReference: string;
    active: boolean;
    roomNights: number;
    blockedNights: number;
    sellableNights: number;
    bookedNights: number;
  }[],
  charges: [] as {
    reservationId: number;
    roomId: number;
    roomName: string;
    roomReference: string;
    guestName: string;
    phase: string;
    startDate: string;
    endDate: string;
    nights: number;
    quoteId: string | null;
    chargeCents: number | null;
  }[],
  collections: [] as {
    entryId: string;
    reservationId: number;
    guestName: string;
    kind: string;
    method: string | null;
    effectiveDate: string;
    recordedAt: string;
    amountCents: number;
    reference: string | null;
    paymentId: string | null;
    reversesId: string | null;
    reversedById: string | null;
    collectedCents: number;
    refundedCents: number;
  }[],
  balances: [] as ReturnType<typeof balance>[],
  notices: [] as string[],
});
export function chargedReport() {
  const r = reportFixture();
  r.charges.push({
    reservationId: 11,
    roomId: 7,
    roomName: "Synthetic lake room",
    roomReference: "SYN-7",
    guestName: "Synthetic Гост",
    phase: "CONFIRMED",
    startDate: r.startDate,
    endDate: r.endDate,
    nights: 3,
    quoteId: "00000000-0000-0000-0000-000000000011",
    chargeCents: 15003,
  });
  r.totals.knownChargeCents = 15003;
  r.totals.chargeCents = 15003;
  return r;
}
export function todayFixture() {
  const stay = {
    reservation: {
      id: 11,
      customerId: 5,
      roomId: 7,
      startDate: "2026-11-07",
      endDate: "2026-11-10",
      version: 1,
      guestCount: 2,
      status: "ACTIVE",
      phase: "CONFIRMED",
    },
    roomName: "Synthetic lake room",
    roomReference: "SYN-7",
    guestName: "Synthetic Гост",
  };
  return {
    propertyDate: "2026-11-07",
    readAt: "2026-11-07T10:00:00.123456Z",
    arrivals: { count: 7, items: [stay] },
    departures: { count: 0, items: [] },
    inHouse: { count: 0, items: [] },
    attention: { count: 0, items: [] },
    guestsInHouse: 0,
    activeRooms: 2,
    roomsWithoutRates: 1,
    dirtyRooms: 1,
    cleaningRooms: 0,
    inspectionRooms: 1,
    cleanRooms: 0,
    blockedRooms: 1,
    balances: {
      outstandingCount: 1,
      outstandingCents: 14003,
      creditCount: 0,
      creditCents: 0,
      unknownCount: 0,
      items: [balance()],
    },
  };
}
