import { z } from "zod";
import { validDate, PROPERTY_TIMEZONE } from "./format";
import { UUID_SHAPE } from "./ids";
const id = z.number().int().positive().max(2147483647);
const version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const date = z.string().refine(validDate);
export const exactInstant = z
  .string()
  .regex(/^[1-9][0-9]{3}-\d{2}-\d{2}T\d{2}:\d{2}:[0-5]\d(\.\d{1,6})?Z$/)
  .refine((value) => Number.isFinite(Date.parse(value)));
export const operationalStaySchema = z
  .object({
    id,
    version,
    roomId: id,
    customerId: id,
    startDate: date,
    endDate: date,
    guestCount: z.number().int().positive().max(1000),
    nights: z.number().int().positive().optional(),
    roomFromDate: date.nullish(),
    status: z.enum(["ACTIVE", "CANCELLED"]),
    phase: z.enum([
      "CONFIRMED",
      "CHECKED_IN",
      "CHECKED_OUT",
      "CANCELLED",
      "NO_SHOW",
    ]),
    checkedInAt: exactInstant.nullish(),
    checkedOutAt: exactInstant.nullish(),
    acceptedQuoteId: z.string().regex(UUID_SHAPE).nullish(),
  })
  .refine(
    (stay) =>
      stay.endDate > stay.startDate &&
      (stay.status === "CANCELLED") ===
        ["CANCELLED", "NO_SHOW"].includes(stay.phase) &&
      (["CHECKED_IN", "CHECKED_OUT"].includes(stay.phase)
        ? !!stay.checkedInAt
        : !stay.checkedInAt) &&
      (stay.phase === "CHECKED_OUT" ? !!stay.checkedOutAt : !stay.checkedOutAt),
  );
export type OperationalStay = z.infer<typeof operationalStaySchema>;
export type StayAction =
  | { kind: "CHECK_IN" }
  | { kind: "CHECK_OUT"; acknowledgeBalance: boolean; reason: string }
  | { kind: "NO_SHOW" | "CANCEL"; reason: string }
  | {
      kind: "CORRECT_STAY";
      checkedInAt: string;
      checkedOutAt?: string;
      reason: string;
    };
export const actionTitle = (kind: StayAction["kind"]) =>
  ({
    CHECK_IN: "Check in guest",
    CHECK_OUT: "Check out guest",
    NO_SHOW: "Record no-show",
    CANCEL: "Cancel reservation",
    CORRECT_STAY: "Correct actual times",
  })[kind];
export const localTime = (utc?: string | null) => {
  if (!utc) return "";
  const parsed = exactInstant.safeParse(utc);
  if (!parsed.success) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PROPERTY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utc));
  const part = (type: string) =>
    parts.find((value) => value.type === type)!.value;
  const fraction = utc.match(/\.([0-9]+)Z$/)?.[1];
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}${fraction ? `.${fraction}` : ""}`;
};
export const timeOptionsSchema = z.object({
  localDateTime: z.string(),
  timezone: z.literal(PROPERTY_TIMEZONE),
  options: z
    .array(
      z.object({
        utc: exactInstant,
        offset: z.string().regex(/^[+-]\d{2}:\d{2}(:\d{2})?$/),
      }),
    )
    .max(2),
});
export const allocationsSchema = z.object({
  reservationId: id,
  reservationVersion: version,
  items: z
    .array(
      z
        .object({
          id: z.string().regex(/^(legacy|[1-9][0-9]*)$/),
          roomId: id,
          roomName: z.string(),
          roomReference: z.string(),
          startDate: date,
          endDate: date,
        })
        .refine((row) => row.endDate > row.startDate),
    )
    .max(100),
  nextCursor: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .nullish(),
});
