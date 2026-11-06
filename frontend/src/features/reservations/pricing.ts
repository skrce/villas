import { z } from "zod";
import { dateSchema } from "../../shared/schemas";
import { validCents } from "../../shared/money";
import { UUID_SHAPE } from "../../shared/ids";

export const quoteIdShape = UUID_SHAPE;
const version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const recordId = z.number().int().positive().max(2147483647);
const cents = z.number().refine(validCents);
const instant = z.union([
  z.date(),
  z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
]);
const nightsBetween = (start: string, end: string) =>
  (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
  86400000;
const lineSchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
    name: z.string().min(1).max(100),
    nightlyCents: cents,
    nights: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    subtotalCents: cents,
  })
  .refine(
    (value) =>
      validCents(value.nightlyCents) &&
      validCents(value.subtotalCents) &&
      Number.isSafeInteger(value.nights) &&
      value.nights > 0 &&
      value.endDate > value.startDate &&
      value.nights === nightsBetween(value.startDate, value.endDate) &&
      BigInt(value.nightlyCents) * BigInt(value.nights) ===
        BigInt(value.subtotalCents),
  );
export const priceSchema = z
  .object({
    currency: z.literal("EUR"),
    rateVersion: version,
    nights: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    lines: z.array(lineSchema).min(1).max(401),
    totalCents: cents,
  })
  .refine(
    (value) =>
      validCents(value.totalCents) &&
      value.lines.every((line) => validCents(line.subtotalCents)) &&
      value.lines.reduce(
        (sum, line) => sum + BigInt(line.subtotalCents),
        0n,
      ) === BigInt(value.totalCents) &&
      value.lines.reduce((sum, line) => sum + line.nights, 0) ===
        value.nights &&
      value.lines.every(
        (line, index) =>
          index === 0 || value.lines[index - 1].endDate === line.startDate,
      ),
  );
export type PriceData = z.infer<typeof priceSchema>;
export const quoteSchema = z
  .object({
    id: z
      .string()
      .regex(quoteIdShape)
      .transform((value) => value.toLowerCase()),
    roomId: recordId,
    startDate: dateSchema,
    endDate: dateSchema,
    guestCount: z.number().int().positive(),
    createdAt: instant,
    expiresAt: instant,
    price: priceSchema,
  })
  .refine(
    (value) =>
      value.endDate > value.startDate &&
      value.expiresAt > value.createdAt &&
      value.price.nights === nightsBetween(value.startDate, value.endDate) &&
      value.price.lines.length > 0 &&
      value.price.lines[0].startDate === value.startDate &&
      value.price.lines.at(-1)!.endDate === value.endDate,
  );
export type QuoteData = z.infer<typeof quoteSchema>;
export const acceptedPriceSchema = z.object({
  reservationId: recordId,
  reservationVersion: version,
  acceptedAt: instant,
  quote: quoteSchema,
});
export type AcceptedPriceData = z.infer<typeof acceptedPriceSchema>;
export type StayInput = {
  customerId: number;
  roomId: number;
  startDate: string;
  endDate: string;
  guestCount?: number;
};
export const stayIdentity = (input: StayInput) =>
  JSON.stringify([
    input.customerId,
    input.roomId,
    input.startDate,
    input.endDate,
    input.guestCount ?? 1,
  ]);
export const matchesQuote = (quote: QuoteData, input: StayInput) =>
  quote.roomId === input.roomId &&
  quote.startDate === input.startDate &&
  quote.endDate === input.endDate &&
  quote.guestCount === (input.guestCount ?? 1);
export function confirmedQuote(value: unknown, input: StayInput): QuoteData {
  const parsed = quoteSchema.safeParse(value);
  if (!parsed.success || !matchesQuote(parsed.data, input))
    throw new Error("The saved quote could not be confirmed.");
  return parsed.data;
}
export function refreshedQuote(
  body: unknown,
  input: StayInput,
): QuoteData | undefined {
  if (
    !body ||
    typeof body !== "object" ||
    !("code" in body) ||
    body.code !== "QUOTE_CHANGED" ||
    !("replacementQuote" in body)
  )
    return;
  const parsed = quoteSchema.safeParse(body.replacementQuote);
  if (parsed.success && matchesQuote(parsed.data, input)) return parsed.data;
}
