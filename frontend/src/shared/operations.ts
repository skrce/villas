import { z } from "zod";
import { validDate } from "./format";
import { UUID_SHAPE } from "./ids";

export const readinessStates = [
  "DIRTY",
  "IN_PROGRESS",
  "INSPECTION",
  "CLEAN",
] as const;
export type ReadinessState = (typeof readinessStates)[number];
export const stateLabel = (state: ReadinessState) =>
  ({
    DIRTY: "Dirty",
    IN_PROGRESS: "Cleaning",
    INSPECTION: "Inspection",
    CLEAN: "Clean",
  })[state];
export const nextState = (state: ReadinessState): ReadinessState | undefined =>
  (
    ({
      DIRTY: "IN_PROGRESS",
      IN_PROGRESS: "INSPECTION",
      INSPECTION: "CLEAN",
      CLEAN: undefined,
    }) as const
  )[state];
export const actionLabel = (state: ReadinessState) =>
  ({
    DIRTY: "Mark dirty",
    IN_PROGRESS: "Start cleaning",
    INSPECTION: "Send for inspection",
    CLEAN: "Mark clean",
  })[state];
const id = z.number().int().positive().max(2147483647);
const version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const date = z.string().refine(validDate);
const instant = z.union([
  z.date(),
  z.iso.datetime().transform((value) => new Date(value)),
]);
const optionalInstant = instant.nullish().transform((value) => value ?? null);
const decimalId = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .refine(
    (value) => value.length <= 19 && BigInt(value) <= 9223372036854775807n,
  );
const cursor = decimalId.nullish().transform((value) => value ?? null);
export const readinessSchema = z.object({
  roomId: id,
  state: z.enum(readinessStates),
  version,
  changedAt: optionalInstant,
});
export const readinessEventSchema = z.object({
  id: decimalId,
  actorId: z.string().regex(UUID_SHAPE),
  operationKey: z.string().regex(UUID_SHAPE),
  version,
  previousState: z.enum(readinessStates),
  state: z.enum(readinessStates),
  reason: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  reservationId: id.nullish().transform((value) => value ?? null),
  occurredAt: instant,
});
export const readinessHistorySchema = z.object({
  items: z.array(readinessEventSchema).max(100),
  nextCursor: cursor,
});
const maintenance = z
  .object({
    id,
    roomId: id,
    startDate: date,
    endDate: date,
    reason: z.string().min(1).max(200),
    version,
    status: z.literal("ACTIVE"),
  })
  .refine((row) => row.endDate > row.startDate);
const room = z
  .object({
    roomId: id,
    name: z.string(),
    reference: z.string(),
    occupied: z.boolean(),
    readiness: readinessSchema,
    maintenance: z.array(maintenance).max(2000),
  })
  .refine(
    (row) =>
      row.readiness.roomId === row.roomId &&
      row.maintenance.every((item) => item.roomId === row.roomId),
  );
export const housekeepingSchema = z
  .object({
    propertyDate: date,
    maintenanceUntil: date,
    rooms: z.array(room).max(50),
    nextCursor: id.nullish().transform((value) => value ?? null),
  })
  .refine(
    (page) =>
      page.maintenanceUntil > page.propertyDate &&
      page.rooms.every((row) =>
        row.maintenance.every(
          (item) =>
            item.startDate < page.maintenanceUntil &&
            item.endDate > page.propertyDate,
        ),
      ),
  );
export type HousekeepingRoom = z.infer<typeof room>;
export const deskLists = [
  "ARRIVALS",
  "DEPARTURES",
  "IN_HOUSE",
  "ATTENTION",
] as const;
export type DeskList = (typeof deskLists)[number];
export const deskLabel = (list: DeskList) =>
  ({
    ARRIVALS: "Arrivals",
    DEPARTURES: "Departures",
    IN_HOUSE: "In-house",
    ATTENTION: "Needs attention",
  })[list];
export const phaseLabel = (phase: string) =>
  ({
    CONFIRMED: "Confirmed",
    CHECKED_IN: "Checked in",
    CHECKED_OUT: "Checked out",
    CANCELLED: "Cancelled",
    NO_SHOW: "No-show",
  })[phase as "CONFIRMED"] ?? phase;
export const frontDeskSchema = z.object({
  propertyDate: date,
  list: z.enum(deskLists),
  items: z
    .array(
      z.object({
        roomName: z.string(),
        roomReference: z.string(),
        guestName: z.string(),
        reservation: z
          .object({
            id,
            customerId: id,
            roomId: id,
            startDate: date,
            endDate: date,
            version,
            guestCount: z.number().int().positive(),
            status: z.literal("ACTIVE"),
            phase: z.enum(["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"]),
          })
          .refine((row) => row.endDate > row.startDate),
      }),
    )
    .max(50),
  nextCursor: id.nullish().transform((value) => value ?? null),
});
