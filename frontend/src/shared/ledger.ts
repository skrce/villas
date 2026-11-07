import { z } from "zod";
import { validDate } from "./format";
import { UUID_SHAPE } from "./ids";

const id = z.number().int().positive().max(2147483647);
const version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const cents = version;
const nullableCents = cents.nullish().transform((value) => value ?? null);
const linkedId = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .refine(
    (value) => value.length <= 19 && BigInt(value) <= 9223372036854775807n,
  );
const optionalId = linkedId.nullish().transform((value) => value ?? null);
const optionalText = z
  .string()
  .nullish()
  .transform((value) => value ?? null);
const date = z.string().refine(validDate);
const uuid = z.string().regex(UUID_SHAPE);
export const paymentMethods = ["CASH", "CARD", "BANK_TRANSFER"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];
export const methodLabel = (value: string | null) =>
  value === "CASH"
    ? "Cash"
    : value === "CARD"
      ? "External card payment"
      : value === "BANK_TRANSFER"
        ? "Bank transfer"
        : "Bookkeeping correction";

export const ledgerEntrySchema = z
  .object({
    id: linkedId,
    reservationId: id,
    reservationVersion: version,
    actorId: uuid,
    operationKey: uuid,
    kind: z.enum(["PAYMENT", "REFUND", "REVERSAL"]),
    currency: z.literal("EUR"),
    amountCents: cents.positive(),
    method: z
      .enum(paymentMethods)
      .nullish()
      .transform((value) => value ?? null),
    paymentId: optionalId,
    reversesId: optionalId,
    reason: optionalText,
    reference: optionalText,
    effectiveDate: date,
    recordedAt: z.iso.datetime(),
  })
  .refine((entry) =>
    entry.kind === "PAYMENT"
      ? entry.method !== null &&
        entry.paymentId === null &&
        entry.reversesId === null
      : entry.kind === "REFUND"
        ? entry.method !== null &&
          entry.paymentId !== null &&
          entry.reversesId === null &&
          !!entry.reason?.trim()
        : entry.method === null &&
          entry.paymentId === null &&
          entry.reversesId !== null &&
          !!entry.reason?.trim() &&
          entry.reference === null,
  );
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
const reservationSchema = z
  .object({
    id,
    version,
    customerId: id,
    roomId: id,
    startDate: date,
    endDate: date,
    guestCount: z.number().int().positive(),
    status: z.enum(["ACTIVE", "CANCELLED"]),
    phase: z.enum([
      "CONFIRMED",
      "CHECKED_IN",
      "CHECKED_OUT",
      "CANCELLED",
      "NO_SHOW",
    ]),
    acceptedQuoteId: uuid.nullish().transform((value) => value ?? null),
  })
  .refine(
    (record) =>
      record.endDate > record.startDate &&
      (record.status === "CANCELLED") ===
        ["CANCELLED", "NO_SHOW"].includes(record.phase),
  );
export const ledgerSummarySchema = z
  .object({
    reservation: reservationSchema,
    propertyDate: date,
    currency: z.literal("EUR"),
    agreedCents: nullableCents,
    accommodationCents: nullableCents,
    outstandingCents: nullableCents,
    creditCents: nullableCents,
    totals: z.object({
      paymentsCents: cents,
      refundsCents: cents,
      receivedCents: cents,
    }),
  })
  .refine((value) => {
    const { paymentsCents, refundsCents, receivedCents } = value.totals;
    if (BigInt(paymentsCents) - BigInt(refundsCents) !== BigInt(receivedCents))
      return false;
    if (!value.reservation.acceptedQuoteId)
      return [
        value.agreedCents,
        value.accommodationCents,
        value.outstandingCents,
        value.creditCents,
      ].every((amount) => amount === null);
    if (value.agreedCents === null || value.agreedCents <= 0) return false;
    const charge = ["CANCELLED", "NO_SHOW"].includes(value.reservation.phase)
      ? 0
      : value.agreedCents;
    return (
      value.accommodationCents === charge &&
      value.outstandingCents === Math.max(0, charge - receivedCents) &&
      value.creditCents === Math.max(0, receivedCents - charge)
    );
  });
export type LedgerSummary = z.infer<typeof ledgerSummarySchema>;
export const ledgerHistorySchema = z.object({
  items: z.array(ledgerEntrySchema).max(100),
  nextCursor: optionalId,
});
export const refundablePaymentsSchema = z.object({
  items: z
    .array(
      z
        .object({ entry: ledgerEntrySchema, refundableCents: cents })
        .refine(
          (item) =>
            item.entry.kind === "PAYMENT" &&
            item.refundableCents <= item.entry.amountCents,
        ),
    )
    .max(100),
  nextCursor: optionalId,
});
export type FinancialAction =
  | {
      kind: "PAYMENT";
      amountCents: number;
      method: PaymentMethod;
      effectiveDate: string;
      reference?: string;
    }
  | {
      kind: "REFUND";
      paymentId: string;
      amountCents: number;
      method: PaymentMethod;
      effectiveDate: string;
      reason: string;
      reference?: string;
    }
  | { kind: "REVERSAL"; entryId: string; amountCents: number; reason: string };

export const entryMatches = (entry: LedgerEntry, action: FinancialAction) => {
  if (entry.kind !== action.kind || entry.amountCents !== action.amountCents)
    return false;
  if (action.kind === "REVERSAL")
    return (
      entry.reversesId === action.entryId &&
      entry.reason === action.reason.trim()
    );
  return (
    entry.method === action.method &&
    entry.effectiveDate === action.effectiveDate &&
    entry.reference === (action.reference?.trim() || null) &&
    (action.kind !== "REFUND" ||
      (entry.paymentId === action.paymentId &&
        entry.reason === action.reason.trim()))
  );
};
