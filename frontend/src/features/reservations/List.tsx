import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { useWorkspace } from "../../app/context";
import { phaseLabel } from "../../shared/operations";
import { positiveId } from "./calendarData";
import { useRooms } from "../rooms/queries";
import {
  addDays,
  dateLabel,
  propertyToday,
  roomChoiceLabel,
  validDate,
} from "../../shared/format";
import {
  Empty,
  Field,
  SelectField,
  Notice,
  PageHead,
  Pending,
  QueryError,
  Table,
} from "../../shared/ui";
export function Reservations() {
  const { apis } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const today = propertyToday();
  const from = params.get("from") || today;
  const to = params.get("to") || addDays(today, 30);
  const status = params.get("status") || "ACTIVE";
  const after = params.get("after");
  const roomId = params.get("room") || "";
  const valid =
    validDate(from) &&
    validDate(to) &&
    to > from &&
    (Date.parse(to) - Date.parse(from)) / 86400000 <= 366 &&
    ["ACTIVE", "CANCELLED", "ALL"].includes(status) &&
    (!after || positiveId(after)) &&
    (!roomId || positiveId(roomId));
  const form = useForm({ values: { from, to, status, roomId } });
  const selectedRoom = useWatch({ control: form.control, name: "roomId" });
  const rooms = useRooms();
  const query = useQuery({
    queryKey: ["reservations", from, to, status, after, roomId],
    queryFn: ({ signal }) =>
      apis.inventoryApi.listReservations(
        {
          startDate: from,
          endDate: to,
          status:
            status === "ALL" ? undefined : (status as "ACTIVE" | "CANCELLED"),
          afterId: after ? Number(after) : undefined,
          limit: 50,
          roomId: roomId ? Number(roomId) : undefined,
        },
        { signal },
      ),
    enabled: valid,
    refetchOnWindowFocus: true,
    refetchOnReconnect: "always",
  });
  return (
    <>
      <PageHead
        title="Reservations"
        actions={
          <Link className="button" to="/reservations/new">
            ＋ New reservation
          </Link>
        }
      >
        A clear view of your property's stays. All dates follow Skopje property
        time.
      </PageHead>
      <section className="panel">
        <form
          className="form-row"
          aria-label="Filter reservations"
          onSubmit={form.handleSubmit((value) =>
            setParams({
              from: value.from,
              to: value.to,
              status: value.status,
              ...(value.roomId ? { room: value.roomId } : {}),
            }),
          )}
        >
          <Field
            label="From"
            type="date"
            required
            min="1000-01-01"
            max="9999-12-31"
            {...form.register("from")}
          />
          <Field
            label="To"
            type="date"
            required
            min="1000-01-01"
            max="9999-12-31"
            {...form.register("to")}
          />
          <SelectField label="Status" {...form.register("status")}>
            <option value="ACTIVE">Active</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="ALL">All statuses</option>
          </SelectField>
          <SelectField
            label="Room"
            {...form.register("roomId")}
            value={selectedRoom}
          >
            <option value="">All rooms</option>
            {selectedRoom &&
              !rooms.data?.some((room) => room.id === Number(selectedRoom)) && (
                <option value={selectedRoom}>
                  Room #{selectedRoom} (name unavailable)
                </option>
              )}
            {rooms.data?.map((room) => (
              <option key={room.id} value={room.id!}>
                {roomChoiceLabel(room)}
              </option>
            ))}
          </SelectField>
          <button className="button secondary">Apply filters</button>
        </form>
      </section>
      {rooms.isError && (
        <Notice error>
          Room names could not be loaded. Your room filter is retained.{" "}
          <button className="text-button" onClick={() => void rooms.refetch()}>
            Reload room names
          </button>
        </Notice>
      )}
      <section className="panel">
        <div className="section-heading">
          <h2>Stays in this period</h2>
          {query.data && (
            <span className="count">
              {query.data.items.length} on this page
            </span>
          )}
        </div>
        {!valid ? (
          <Notice error>
            Choose valid dates spanning no more than 366 days and a supported
            status.{" "}
            <button className="text-button" onClick={() => setParams({})}>
              Reset filters
            </button>
          </Notice>
        ) : query.isPending ? (
          <Pending />
        ) : query.isError ? (
          <QueryError retry={() => void query.refetch()} />
        ) : !query.data.items.length ? (
          <Empty headingLevel={2} title="No stays in this period">
            Change the dates or add a reservation.
          </Empty>
        ) : (
          <>
            <Table
              label="Reservations"
              headings={["Reservation", "Room", "Stay", "Guests", "Status", ""]}
            >
              {query.data.items.map((booking) => (
                <tr key={booking.id}>
                  <td>
                    <strong>#{booking.id}</strong>
                  </td>
                  <td>
                    {rooms.data?.find((room) => room.id === booking.roomId)
                      ? roomChoiceLabel(
                          rooms.data.find(
                            (room) => room.id === booking.roomId,
                          )!,
                        )
                      : `Room ${booking.roomId}`}
                  </td>
                  <td>
                    {dateLabel(booking.startDate)}
                    <span className="subline">
                      to {dateLabel(booking.endDate)} · {booking.nights} nights
                    </span>
                  </td>
                  <td>{booking.guestCount}</td>
                  <td>
                    <span
                      className={`status status-${(booking.phase ?? booking.status)?.toLowerCase()}`}
                    >
                      {phaseLabel(booking.phase ?? booking.status ?? "Unknown")}
                    </span>
                  </td>
                  <td>
                    <Link
                      className="text-link"
                      to={`/reservations/${booking.id}`}
                    >
                      View
                      <span className="sr-only"> reservation {booking.id}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
            {query.data.nextCursor && (
              <div className="pagination">
                <button
                  className="button secondary"
                  onClick={() =>
                    setParams({
                      from,
                      to,
                      status,
                      after: String(query.data.nextCursor),
                      ...(roomId ? { room: roomId } : {}),
                    })
                  }
                >
                  Next 50 stays →
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
