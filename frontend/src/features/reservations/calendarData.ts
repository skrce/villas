import { z } from "zod";
import { addDays, validDate } from "../../shared/format";

export const positiveId = (value: string | null) =>
  value !== null && /^[1-9]\d*$/.test(value) && Number(value) <= 2147483647;
const id = z.number().int().positive().max(2147483647);
const version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const date = z.string().refine(validDate);
const interval = {
  id,
  roomId: id,
  startDate: date,
  endDate: date,
  version,
  status: z.literal("ACTIVE"),
};
const schema = z.object({
  startDate: date,
  endDate: date,
  rooms: z
    .array(
      z.object({
        id,
        name: z.string().min(1).max(200),
        reference: z.string().min(1).max(32),
        capacity: z.number().int().min(1).max(1000),
        active: z.boolean(),
      }),
    )
    .max(50),
  stays: z
    .array(
      z.object({
        ...interval,
        customerId: id,
        guestName: z.string().min(1).max(401),
        guestCount: z.number().int().min(1).max(1000),
      }),
    )
    .max(2000),
  maintenance: z
    .array(z.object({ ...interval, reason: z.string().min(1).max(200) }))
    .max(2000),
  nextRoomCursor: id.nullish(),
});
export type CalendarData = z.infer<typeof schema>;
export type CalendarEvent =
  | (CalendarData["stays"][number] & { kind: "stay" })
  | (CalendarData["maintenance"][number] & { kind: "maintenance" });
export function calendarEvents(
  data: CalendarData,
  roomId: number,
): CalendarEvent[] {
  return [
    ...data.stays
      .filter((s) => s.roomId === roomId)
      .map((s) => ({ ...s, kind: "stay" as const })),
    ...data.maintenance
      .filter((s) => s.roomId === roomId)
      .map((s) => ({ ...s, kind: "maintenance" as const })),
  ].sort((a, b) => a.startDate.localeCompare(b.startDate));
}
export function confirmedCalendar(
  value: unknown,
  from: string,
  to: string,
  after: number,
  limit: number,
  archived: boolean,
): CalendarData {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error("The calendar response is incomplete.");
  const data = result.data;
  const roomIds = data.rooms.map((r) => r.id);
  if (
    data.startDate !== from ||
    data.endDate !== to ||
    data.rooms.length > limit ||
    new Set(roomIds).size !== roomIds.length ||
    roomIds.some((n, i) => n <= (i ? roomIds[i - 1] : after)) ||
    (!archived && data.rooms.some((r) => !r.active)) ||
    (data.nextRoomCursor != null &&
      (data.rooms.length !== limit || data.nextRoomCursor !== roomIds.at(-1)))
  )
    throw new Error("The calendar does not match this room page.");
  for (const events of [data.stays, data.maintenance]) {
    if (new Set(events.map((e) => e.id)).size !== events.length)
      throw new Error("The calendar contains duplicate records.");
    if (
      events.some(
        (e) =>
          !roomIds.includes(e.roomId) ||
          e.endDate <= e.startDate ||
          e.startDate >= to ||
          e.endDate <= from,
      )
    )
      throw new Error("The calendar contains an invalid period.");
  }
  for (const roomId of roomIds) {
    const events = calendarEvents(data, roomId);
    if (events.some((e, i) => i > 0 && events[i - 1].endDate > e.startDate))
      throw new Error("The calendar contains overlapping inventory records.");
  }
  return data;
}
export function freePeriod(
  data: CalendarData,
  roomId: number,
  from: string,
  to: string,
) {
  return (
    from >= data.startDate &&
    to <= data.endDate &&
    to > from &&
    data.rooms.some((r) => r.id === roomId && r.active) &&
    !calendarEvents(data, roomId).some(
      (e) => e.startDate < to && e.endDate > from,
    )
  );
}
export function agendaGaps(data: CalendarData, roomId: number) {
  const gaps: { from: string; to: string }[] = [];
  let cursor = data.startDate;
  for (const event of calendarEvents(data, roomId)) {
    if (event.startDate > cursor)
      gaps.push({ from: cursor, to: event.startDate });
    cursor = event.endDate > cursor ? event.endDate : cursor;
  }
  if (cursor < data.endDate) gaps.push({ from: cursor, to: data.endDate });
  return gaps;
}
export function bookingLink(room: number, from: string, to: string) {
  return `/reservations/new?${new URLSearchParams({ room: String(room), from, to })}`;
}
export function bookingSeed(params: URLSearchParams, today: string) {
  const guest = params.get("guest");
  const room = params.get("room");
  const from = params.get("from");
  const to = params.get("to");
  const valid =
    (guest === null || positiveId(guest)) &&
    (room === null || positiveId(room)) &&
    ((from === null && to === null) ||
      (from !== null &&
        to !== null &&
        validDate(from) &&
        validDate(to) &&
        to > from));
  const identity = JSON.stringify([guest, room, from, to]);
  return {
    valid,
    identity,
    key:
      valid && room === null && from === null && to === null
        ? guest
          ? `reservation-create-guest-${guest}`
          : "reservation-create"
        : `reservation-create-${identity}`,
    guestId: valid && guest ? Number(guest) : 0,
    roomId: valid ? (room ?? "") : "",
    startDate: valid && from ? from : today,
    endDate:
      valid && to
        ? to
        : addDays(today === "9999-12-31" ? "9999-12-30" : today, 1),
  };
}
