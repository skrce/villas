import { z } from "zod";
import { dateSchema } from "../../shared/schemas";
import { euroInput, parseEuroCents, validCents } from "../../shared/money";

const amount = z
  .string()
  .refine(
    (value) => parseEuroCents(value) !== null,
    "Enter a positive EUR amount with at most two decimal places.",
  );
const wireSeason = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .refine((value) => !/\p{Cc}/u.test(value)),
  startDate: dateSchema,
  endDate: dateSchema,
  nightlyCents: z.number().refine(validCents),
});
const wireRates = z.object({
  roomId: z.number().int().positive().max(2147483647),
  currency: z.literal("EUR"),
  baseNightlyCents: z
    .number()
    .refine(validCents)
    .nullish()
    .transform((value) => value ?? null),
  version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  seasons: z.array(wireSeason).max(200),
});
export type RateData = z.infer<typeof wireRates>;
const season = z
  .object({
    name: z.string().trim().min(1, "Give this season a name.").max(100),
    startDate: dateSchema,
    endDate: dateSchema,
    price: amount,
  })
  .refine((value) => value.endDate > value.startDate, {
    path: ["endDate"],
    message: "End date must be after start date.",
  });
export const rateSchema = z
  .object({ base: amount, seasons: z.array(season).max(200) })
  .superRefine((value, context) => {
    const sorted = value.seasons
      .map((rule, index) => ({ ...rule, index }))
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    sorted.slice(1).forEach((rule, index) => {
      if (sorted[index].endDate > rule.startDate)
        context.addIssue({
          code: "custom",
          path: ["seasons", rule.index, "startDate"],
          message: "Seasonal periods must not overlap.",
        });
    });
  });
export type RateFields = z.infer<typeof rateSchema>;
export const rateFields = (rates: RateData): RateFields => ({
  base: euroInput(rates.baseNightlyCents),
  seasons: (rates.seasons ?? []).map((rule) => ({
    name: rule.name,
    startDate: rule.startDate,
    endDate: rule.endDate,
    price: euroInput(rule.nightlyCents),
  })),
});
export function confirmedRates(value: unknown, roomId: number): RateData {
  const parsed = wireRates.safeParse(value);
  if (!parsed.success || parsed.data.roomId !== roomId)
    throw new Error("The saved room rates could not be confirmed.");
  const rates = parsed.data;
  const fields = rateFields(rates);
  if (rates.baseNightlyCents == null) {
    if (rates.version !== 0 || rates.seasons.length)
      throw new Error("The saved room rates could not be confirmed.");
  } else if (rates.version < 1 || !rateSchema.safeParse(fields).success)
    throw new Error("The saved room rates could not be confirmed.");
  return rates;
}

export function matchesRateInput(rates: RateData, values: RateFields): boolean {
  const normalize = (name: string) =>
    name
      .normalize("NFC")
      .replace(/[\p{Z}\s]+/gu, " ")
      .trim();
  const wanted = values.seasons
    .map((rule) => ({
      ...rule,
      name: normalize(rule.name),
      nightlyCents: parseEuroCents(rule.price),
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map(({ name, startDate, endDate, nightlyCents }) => ({
      name,
      startDate,
      endDate,
      nightlyCents,
    }));
  return (
    rates.baseNightlyCents === parseEuroCents(values.base) &&
    JSON.stringify(rates.seasons) === JSON.stringify(wanted)
  );
}
