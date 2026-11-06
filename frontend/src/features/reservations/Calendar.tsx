import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useOnline } from "../../shared/useOnline";
import { useWorkspace } from "../../app/context";
import {
  addDays,
  dateLabel,
  propertyToday,
  validDate,
} from "../../shared/format";
import {
  Empty,
  Field,
  Notice,
  PageHead,
  Pending,
  QueryError,
  RecordState,
  Status,
} from "../../shared/ui";
import {
  agendaGaps,
  bookingLink,
  calendarEvents,
  confirmedCalendar,
  freePeriod,
  positiveId,
  type CalendarData,
  type CalendarEvent,
} from "./calendarData";

export function BookingCalendar() {
  const { apis } = useWorkspace();
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const from = params.get("from") ?? propertyToday();
  const cursor = params.get("after");
  const archived = params.get("archived") === "true";
  const valid =
    validDate(from) &&
    from <= "9999-12-24" &&
    (!cursor || positiveId(cursor)) &&
    (!params.has("archived") ||
      ["true", "false"].includes(params.get("archived")!));
  const to = valid ? addDays(from, 7) : "";
  const after = Number(cursor || 0);
  const form = useForm({ values: { from, archived } });
  const identity = JSON.stringify([from, after, archived]);
  const [selection, setSelection] = useState<{
    identity: string;
    room: number;
    anchor: string;
    from: string;
    to: string;
  }>();
  const query = useQuery({
    queryKey: ["calendar", from, to, after, archived],
    queryFn: async ({ signal }) =>
      confirmedCalendar(
        await apis.calendarApi.bookingCalendar(
          {
            startDate: from,
            endDate: to,
            afterRoomId: after,
            includeArchived: archived,
            limit: 20,
          },
          { signal },
        ),
        from,
        to,
        after,
        20,
        archived,
      ),
    enabled: valid,
    refetchOnWindowFocus: true,
    refetchOnReconnect: "always",
  });
  const data = query.data;
  const ready =
    online && !!data && !query.isFetching && !query.isError && !query.isPaused;
  const selected = selection?.identity === identity ? selection : undefined;
  const stillFree =
    !!selected &&
    !!data &&
    freePeriod(data, selected.room, selected.from, selected.to);
  const go = (start: string, next = 0) =>
    setParams({
      from: start,
      ...(archived ? { archived: "true" } : {}),
      ...(next ? { after: String(next) } : {}),
    });
  const choose = (room: number, day: string) => {
    if (!ready || !data) return;
    const first = selected?.room === room && stillFree ? selected.anchor : day;
    const start = first < day ? first : day;
    const end = addDays(first > day ? first : day, 1);
    const canExtend = freePeriod(data, room, start, end);
    setSelection({
      identity,
      room,
      anchor: canExtend ? first : day,
      from: canExtend ? start : day,
      to: canExtend ? end : addDays(day, 1),
    });
  };
  return (
    <>
      <PageHead
        eyebrow="Reservations"
        title="Room calendar"
        actions={
          <Link className="button" to="/reservations/new">
            ＋ New reservation
          </Link>
        }
      >
        A week at Villa Rosa. Property dates follow Europe/Skopje.
      </PageHead>
      <section className="panel calendar-controls">
        <form
          className="form-row"
          aria-label="Calendar dates"
          onSubmit={form.handleSubmit((v) =>
            setParams({
              from: v.from,
              ...(v.archived ? { archived: "true" } : {}),
            }),
          )}
        >
          <Field
            label="Week starting"
            type="date"
            required
            min="1000-01-01"
            max="9999-12-24"
            {...form.register("from")}
          />
          <label className="checkbox-field">
            <input type="checkbox" {...form.register("archived")} /> Include
            archived rooms
          </label>
          <button className="button secondary">Show week</button>
        </form>
        <div className="calendar-navigation" aria-label="Week navigation">
          <button
            className="button secondary"
            disabled={!valid || from < "1000-01-08"}
            onClick={() => go(addDays(from, -7))}
          >
            ← Previous week
          </button>
          <button className="button quiet" onClick={() => go(propertyToday())}>
            Today
          </button>
          <button
            className="button secondary"
            disabled={!valid || from > "9999-12-17"}
            onClick={() => go(addDays(from, 7))}
          >
            Next week →
          </button>
          <button
            className="button quiet"
            disabled={!valid || !online || query.isFetching || query.isPaused}
            onClick={() => void query.refetch()}
          >
            Refresh calendar
          </button>
          <Link
            className="text-link"
            to={`/reservations?${new URLSearchParams({ from: valid ? from : propertyToday(), to: valid ? to : addDays(propertyToday(), 7) })}`}
          >
            Reservation list
          </Link>
        </div>
      </section>
      {!valid ? (
        <Notice error>
          Choose a valid starting date and room page.{" "}
          <button className="text-button" onClick={() => setParams({})}>
            Reset calendar
          </button>
        </Notice>
      ) : !online || query.isPaused ? (
        <Notice>
          You're offline. Reconnect to refresh the calendar and select a stay.
        </Notice>
      ) : query.isPending ? (
        <Pending label="Loading room calendar…" />
      ) : query.isError ? (
        <>
          <Notice error>
            Availability could not be confirmed for this week. No empty period
            can be selected until a complete calendar is loaded.
          </Notice>
          <QueryError retry={() => void query.refetch()} />
        </>
      ) : (
        data && (
          <section className="panel calendar-panel" aria-label="Room calendar">
            <div className="section-heading">
              <div>
                <h2>
                  {dateLabel(from)} to {dateLabel(to)}
                </h2>
                <p className="hint">
                  Active stays and maintenance · {data.rooms.length} rooms on
                  this page
                </p>
              </div>
              <div className="calendar-legend">
                <span>● Reservation</span>
                <span>▧ Maintenance</span>
              </div>
            </div>
            {query.isFetching && (
              <Pending label="Updating calendar. Date selection is paused…" />
            )}
            {!data.rooms.length ? (
              <Empty title="No rooms on this page">
                <Link to="/rooms">Manage rooms</Link> or return to the first
                room page.
              </Empty>
            ) : (
              <>
                <p className="hint calendar-grid-help" id="calendar-help">
                  Select the first and last free night in the same room, then
                  choose Create reservation. Tab and Enter work on every free
                  night. Availability is checked again at confirmation.
                </p>
                <div className="calendar-desktop">
                  <table
                    className="calendar-grid"
                    aria-describedby="calendar-help"
                  >
                    <caption className="sr-only">
                      Room availability from {dateLabel(from)} to{" "}
                      {dateLabel(to)}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Room</th>
                        {Array.from({ length: 7 }, (_, i) => (
                          <th scope="col" key={i}>
                            {dateLabel(addDays(from, i))}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.rooms.map((room) => (
                        <tr key={room.id}>
                          <th scope="row">
                            <Link to={`/rooms/${room.id}`}>{room.name}</Link>
                            <small>
                              {room.reference} · up to {room.capacity}
                            </small>
                            {!room.active && <RecordState active={false} />}
                          </th>
                          <CalendarCells
                            data={data}
                            room={room}
                            ready={ready}
                            selected={stillFree ? selected : undefined}
                            choose={choose}
                          />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="calendar-agenda" aria-label="Room agenda">
                  {data.rooms.map((room) => (
                    <article className="agenda-room" key={room.id}>
                      <div className="section-heading">
                        <h3>
                          <Link to={`/rooms/${room.id}`}>{room.name}</Link>
                        </h3>
                        <RecordState active={room.active} />
                      </div>
                      <p className="hint">
                        {room.reference} · up to {room.capacity} guests
                      </p>
                      {calendarEvents(data, room.id).map((event) => (
                        <CalendarCard
                          key={`${event.kind}-${event.id}`}
                          event={event}
                          from={data.startDate}
                          to={data.endDate}
                        />
                      ))}
                      {room.active &&
                        agendaGaps(data, room.id).map((gap) => (
                          <div className="agenda-gap" key={gap.from}>
                            <span>
                              Free · {dateLabel(gap.from)} to{" "}
                              {dateLabel(gap.to)}
                            </span>
                            {ready ? (
                              <Link
                                className="button secondary"
                                to={bookingLink(room.id, gap.from, gap.to)}
                              >
                                Reserve this period
                                <span className="sr-only">
                                  {" "}
                                  in {room.name}, {dateLabel(gap.from)} to{" "}
                                  {dateLabel(gap.to)}
                                </span>
                              </Link>
                            ) : (
                              <span className="hint">Refresh to select</span>
                            )}
                          </div>
                        ))}
                    </article>
                  ))}
                </div>
              </>
            )}
            {selected && (
              <div className="calendar-selection" role="status">
                {stillFree ? (
                  <>
                    <strong>
                      {data.rooms.find((r) => r.id === selected.room)?.name}
                    </strong>
                    <span>
                      {dateLabel(selected.from)} to {dateLabel(selected.to)}
                    </span>
                    {ready && (
                      <Link
                        className="button"
                        to={bookingLink(
                          selected.room,
                          selected.from,
                          selected.to,
                        )}
                      >
                        Create reservation
                      </Link>
                    )}
                  </>
                ) : (
                  <p>
                    This selection is no longer free. Choose another period.
                  </p>
                )}
                <button
                  className="button quiet"
                  onClick={() => setSelection(undefined)}
                >
                  Clear selection
                </button>
              </div>
            )}
            <div className="pagination">
              {after > 0 && (
                <button className="button secondary" onClick={() => go(from)}>
                  First room page
                </button>
              )}
              {data.nextRoomCursor && (
                <button
                  className="button secondary"
                  onClick={() => go(from, data.nextRoomCursor!)}
                >
                  Next 20 rooms →
                </button>
              )}
            </div>
          </section>
        )
      )}
    </>
  );
}
function CalendarCard({
  event,
  from,
  to,
}: {
  event: CalendarEvent;
  from: string;
  to: string;
}) {
  return (
    <Link
      className={`calendar-event ${event.kind}`}
      to={
        event.kind === "stay"
          ? `/reservations/${event.id}`
          : `/rooms/${event.roomId}?${new URLSearchParams({ from, to, history: "1" })}#maintenance`
      }
    >
      <strong>{event.kind === "stay" ? event.guestName : "Maintenance"}</strong>
      <span>
        {dateLabel(event.startDate)} to {dateLabel(event.endDate)}
      </span>
      <small>
        {event.kind === "stay"
          ? `${event.guestCount} ${event.guestCount === 1 ? "guest" : "guests"} · #${event.id}`
          : event.reason}
      </small>
      <Status value={event.status} />
    </Link>
  );
}
function CalendarCells({
  data,
  room,
  ready,
  selected,
  choose,
}: {
  data: CalendarData;
  room: CalendarData["rooms"][number];
  ready: boolean;
  selected?: { room: number; from: string; to: string };
  choose: (room: number, day: string) => void;
}) {
  const events = calendarEvents(data, room.id);
  const cells = [];
  let i = 0;
  while (i < 7) {
    const day = addDays(data.startDate, i);
    const event = events.find((e) => e.startDate <= day && e.endDate > day);
    if (event) {
      const end = event.endDate < data.endDate ? event.endDate : data.endDate;
      const span = (Date.parse(end) - Date.parse(day)) / 86400000;
      cells.push(
        <td key={day} colSpan={span}>
          <CalendarCard event={event} from={data.startDate} to={data.endDate} />
        </td>,
      );
      i += span;
    } else {
      cells.push(
        <td key={day} className="calendar-free">
          <button
            disabled={!ready || !room.active}
            aria-label={`Select ${room.name}, night of ${dateLabel(day)}`}
            aria-pressed={
              selected?.room === room.id &&
              day >= selected.from &&
              day < selected.to
            }
            onClick={() => choose(room.id, day)}
          >
            <span aria-hidden="true">＋</span>
            <span className="sr-only">Free night</span>
          </button>
        </td>,
      );
      i++;
    }
  }
  return cells;
}
