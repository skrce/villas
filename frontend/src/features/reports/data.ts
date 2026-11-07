import { z } from "zod";
import { frontDeskSchema } from "../../shared/operations";
import { UUID_SHAPE } from "../../shared/ids";
import { validDate } from "../../shared/format";

export const kinds = [
  "OCCUPANCY",
  "CHARGES",
  "COLLECTIONS",
  "BALANCES",
] as const;
export type Kind = (typeof kinds)[number];
export const reportLabel = (kind: Kind) =>
  ({
    OCCUPANCY: "Booked occupancy",
    CHARGES: "Booked charges",
    COLLECTIONS: "Corrected collections",
    BALANCES: "Current balances",
  })[kind];
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const signed = z
  .number()
  .int()
  .min(-Number.MAX_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);
const id = count.positive().max(2147483647);
const date = z.string().refine(validDate);
const money = count.nullish().transform((v) => v ?? null);
const decimalId = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .refine((v) => v.length <= 19 && BigInt(v) <= 9223372036854775807n);
const optionalId = decimalId.nullish().transform((v) => v ?? null);
const phase = z.enum([
  "CONFIRMED",
  "CHECKED_IN",
  "CHECKED_OUT",
  "CANCELLED",
  "NO_SHOW",
]);
export const balanceSchema = z
  .object({
    reservationId: id,
    guestName: z.string(),
    phase,
    startDate: date,
    endDate: date,
    agreedCents: money,
    accommodationCents: money,
    receivedCents: count,
    outstandingCents: money,
    creditCents: money,
  })
  .refine((r) => {
    const owed =
      r.agreedCents === null
        ? null
        : ["CANCELLED", "NO_SHOW"].includes(r.phase)
          ? 0
          : r.agreedCents;
    return (
      r.endDate > r.startDate &&
      (r.agreedCents === null || r.agreedCents > 0) &&
      r.accommodationCents === owed &&
      (owed === null
        ? r.outstandingCents === null && r.creditCents === null
        : r.outstandingCents === Math.max(0, owed - r.receivedCents) &&
          r.creditCents === Math.max(0, r.receivedCents - owed))
    );
  });
const chargeSchema = z
  .object({
    reservationId: id,
    roomId: id,
    roomName: z.string(),
    roomReference: z.string(),
    guestName: z.string(),
    phase,
    startDate: date,
    endDate: date,
    nights: count.positive().max(366),
    quoteId: z
      .string()
      .regex(UUID_SHAPE)
      .nullish()
      .transform((v) => v ?? null),
    chargeCents: money,
  })
  .refine(
    (r) =>
      r.endDate > r.startDate &&
      r.nights ===
        (Date.parse(`${r.endDate}T00:00:00Z`) -
          Date.parse(`${r.startDate}T00:00:00Z`)) /
          86400000 &&
      (r.quoteId === null
        ? r.chargeCents === null
        : r.chargeCents !== null &&
          (["CANCELLED", "NO_SHOW"].includes(r.phase)
            ? r.chargeCents === 0
            : r.chargeCents > 0)),
  );
const collectionSchema = z
  .object({
    entryId: decimalId,
    reservationId: id,
    guestName: z.string(),
    kind: z.enum(["PAYMENT", "REFUND", "REVERSAL"]),
    method: z
      .enum(["CASH", "CARD", "BANK_TRANSFER"])
      .nullish()
      .transform((v) => v ?? null),
    effectiveDate: date,
    recordedAt: z.iso.datetime(),
    amountCents: count.positive(),
    reference: z.string().nullish(),
    paymentId: optionalId,
    reversesId: optionalId,
    reversedById: optionalId,
    collectedCents: count,
    refundedCents: count,
  })
  .refine((r) => {
    if (r.kind === "REVERSAL")
      return (
        r.method === null &&
        r.paymentId === null &&
        r.reversesId !== null &&
        r.reversesId !== r.entryId &&
        r.reversedById === null &&
        r.collectedCents === 0 &&
        r.refundedCents === 0
      );
    if (
      r.method === null ||
      r.reversesId !== null ||
      r.reversedById === r.entryId
    )
      return false;
    const effective = r.reversedById === null ? r.amountCents : 0;
    return r.kind === "PAYMENT"
      ? r.paymentId === null &&
          r.collectedCents === effective &&
          r.refundedCents === 0
      : r.paymentId !== null &&
          r.paymentId !== r.entryId &&
          r.collectedCents === 0 &&
          r.refundedCents === effective;
  });
const queue = z
  .object({ count, items: frontDeskSchema.shape.items.max(5) })
  .refine((r) => r.count >= r.items.length);
export const todaySchema = z
  .object({
    propertyDate: date,
    readAt: z.iso.datetime(),
    arrivals: queue,
    departures: queue,
    inHouse: queue,
    attention: queue,
    guestsInHouse: count,
    activeRooms: count,
    roomsWithoutRates: count,
    dirtyRooms: count,
    cleaningRooms: count,
    inspectionRooms: count,
    cleanRooms: count,
    blockedRooms: count,
    balances: z.object({
      outstandingCount: count,
      outstandingCents: count,
      creditCount: count,
      creditCents: count,
      unknownCount: count,
      items: z.array(balanceSchema).max(5),
    }),
  })
  .refine(
    (r) =>
      r.dirtyRooms + r.cleaningRooms + r.inspectionRooms + r.cleanRooms ===
        r.activeRooms &&
      r.blockedRooms <= r.activeRooms &&
      r.roomsWithoutRates <= r.activeRooms,
  );

const totals = z.object({
  roomNights: count,
  blockedNights: count,
  sellableNights: count,
  bookedNights: count,
  knownChargeCents: count,
  chargeCents: money,
  collectedCents: count,
  refundedCents: count,
  netCollectedCents: signed,
  knownOutstandingCents: count,
  outstandingCents: money,
  knownCreditCents: count,
  creditCents: money,
  unknownPriceCount: count,
});
export const reportSchema = z
  .object({
    kind: z.enum(kinds),
    startDate: date,
    endDate: date,
    propertyDate: date,
    roomId: id.nullish().transform((v) => v ?? null),
    snapshotId: z.string().regex(/^[a-f0-9]{64}$/),
    totals,
    occupancy: z
      .array(
        z.object({
          roomId: id,
          roomName: z.string(),
          roomReference: z.string(),
          active: z.boolean(),
          roomNights: count,
          blockedNights: count,
          sellableNights: count,
          bookedNights: count,
        }),
      )
      .max(500),
    charges: z.array(chargeSchema).max(10000),
    collections: z.array(collectionSchema).max(5000),
    balances: z.array(balanceSchema).max(2000),
    notices: z.array(
      z.enum([
        "NO_ROOMS",
        "NO_ACTIVE_ROOMS",
        "CURRENT_INVENTORY_BASIS",
        "INVENTORY_CONFLICT",
        "UNKNOWN_PRICES",
      ]),
    ),
  })
  .refine((r) => {
    if (!validPeriod(r.startDate, r.endDate)) return false;
    const sum = (values: number[]) =>
      values.reduce((a, v) => a + BigInt(v), 0n);
    const t = r.totals;
    const periodNights =
      (Date.parse(`${r.endDate}T00:00:00Z`) -
        Date.parse(`${r.startDate}T00:00:00Z`)) /
      86400000;
    if (
      r.roomId !== null &&
      (r.occupancy.some((row) => row.roomId !== r.roomId) ||
        r.charges.some((row) => row.roomId !== r.roomId))
    )
      return false;
    if (
      r.occupancy.some(
        (row) =>
          row.roomNights !== (row.active ? periodNights : 0) ||
          row.bookedNights > periodNights ||
          (row.active &&
            row.bookedNights > row.sellableNights &&
            !r.notices.includes("INVENTORY_CONFLICT")),
      )
    )
      return false;
    if (
      (r.kind !== "OCCUPANCY" && r.occupancy.length > 0) ||
      (r.kind !== "CHARGES" && r.charges.length > 0) ||
      (r.kind !== "COLLECTIONS" && r.collections.length > 0) ||
      (r.kind !== "BALANCES" && r.balances.length > 0)
    )
      return false;
    if (
      r.charges.some(
        (row) => row.startDate < r.startDate || row.endDate > r.endDate,
      ) ||
      r.collections.some(
        (row) =>
          row.effectiveDate < r.startDate || row.effectiveDate >= r.endDate,
      ) ||
      r.balances.some(
        (row) => row.startDate >= r.endDate || row.endDate <= r.startDate,
      )
    )
      return false;
    if (
      new Set(r.occupancy.map((row) => row.roomId)).size !==
        r.occupancy.length ||
      new Set(r.balances.map((row) => row.reservationId)).size !==
        r.balances.length ||
      new Set(r.collections.map((row) => row.entryId)).size !==
        r.collections.length
    )
      return false;
    if (r.kind === "OCCUPANCY") {
      const active = r.occupancy.filter((row) => row.active);
      return (
        r.occupancy.every(
          (row) => row.roomNights - row.blockedNights === row.sellableNights,
        ) &&
        sum(active.map((row) => row.roomNights)) === BigInt(t.roomNights) &&
        sum(active.map((row) => row.blockedNights)) ===
          BigInt(t.blockedNights) &&
        sum(active.map((row) => row.sellableNights)) ===
          BigInt(t.sellableNights) &&
        sum(active.map((row) => row.bookedNights)) === BigInt(t.bookedNights)
      );
    }
    if (r.kind === "CHARGES") {
      const grouped = new Map<number, typeof r.charges>();
      for (const row of r.charges) {
        const group = grouped.get(row.reservationId) ?? [];
        group.push(row);
        grouped.set(row.reservationId, group);
      }
      for (const group of grouped.values()) {
        const first = group[0];
        if (
          group.some(
            (row) =>
              row.quoteId !== first.quoteId ||
              row.phase !== first.phase ||
              row.guestName !== first.guestName,
          )
        )
          return false;
        const ordered = [...group].sort((a, b) =>
          a.startDate.localeCompare(b.startDate),
        );
        if (
          ordered.some(
            (row, index) =>
              index > 0 &&
              (ordered[index - 1].endDate > row.startDate ||
                (r.roomId === null &&
                  ordered[index - 1].endDate !== row.startDate)),
          )
        )
          return false;
      }
      const unknown = new Set(
        r.charges
          .filter((row) => row.chargeCents === null)
          .map((row) => row.reservationId),
      ).size;
      return (
        unknown === t.unknownPriceCount &&
        sum(r.charges.map((row) => row.chargeCents ?? 0)) ===
          BigInt(t.knownChargeCents) &&
        t.chargeCents === (unknown ? null : t.knownChargeCents)
      );
    }
    if (r.kind === "COLLECTIONS")
      return (
        sum(r.collections.map((row) => row.collectedCents)) ===
          BigInt(t.collectedCents) &&
        sum(r.collections.map((row) => row.refundedCents)) ===
          BigInt(t.refundedCents) &&
        t.collectedCents - t.refundedCents === t.netCollectedCents
      );
    const unknown = r.balances.filter(
      (row) => row.outstandingCents === null,
    ).length;
    return (
      unknown === t.unknownPriceCount &&
      sum(r.balances.map((row) => row.outstandingCents ?? 0)) ===
        BigInt(t.knownOutstandingCents) &&
      sum(r.balances.map((row) => row.creditCents ?? 0)) ===
        BigInt(t.knownCreditCents) &&
      t.outstandingCents === (unknown ? null : t.knownOutstandingCents) &&
      t.creditCents === (unknown ? null : t.knownCreditCents)
    );
  }, "Report totals could not be reconciled with their source rows.");
export type Report = z.infer<typeof reportSchema>;
export type Today = z.infer<typeof todaySchema>;
export function validPeriod(start: string, end: string) {
  if (!validDate(start) || !validDate(end) || end <= start) return false;
  return (
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      86400000 <=
    366
  );
}
export const noticeLabel = (notice: Report["notices"][number]) =>
  ({
    NO_ROOMS:
      "No rooms are configured. Add rooms and rates before interpreting this property's activity.",
    NO_ACTIVE_ROOMS:
      "There are no currently active rooms. Current sellable capacity has no occupancy percentage.",
    CURRENT_INVENTORY_BASIS:
      "Capacity uses today's active room roster and current maintenance records for the whole period. Historical room availability was not tracked. Archived-room nights are listed separately and excluded from the occupancy total.",
    INVENTORY_CONFLICT:
      "Saved room assignments overlap one another or maintenance. Review the source bookings and room calendar before relying on occupancy.",
    UNKNOWN_PRICES:
      "Some bookings have no accepted EUR price. Only known subtotals are shown; the complete amount is unknown.",
  })[notice];
export const definition = (kind: Kind) =>
  ({
    OCCUPANCY:
      "Booked nights use dated room assignments and exclude cancellations and no-shows. Capacity uses the current active-room roster throughout the period. Sellable nights subtract active maintenance. Readiness does not change capacity. This measures bookings, not actual guest presence.",
    CHARGES:
      "Nights in this period use the latest accepted quote, including earlier room nights after a repriced move. Cancellations and no-shows owe zero. Current room rates do not change saved prices. These are booked charges, not collected cash or accounting revenue.",
    COLLECTIONS:
      "The period selects actual payment and refund dates, regardless of stay dates. Reversed originals and correction rows remain visible with zero effect. Later corrections restate earlier periods. A room filter selects funds for bookings with any assignment to that room; it does not allocate receipts between rooms.",
    BALANCES:
      "Current whole-booking balances for stays with a dated assignment overlapping this period and selected room. Payments include all dates. Cancellations and no-shows owe zero and retain held credit. This is today's position, not a period-end balance.",
  })[kind];
