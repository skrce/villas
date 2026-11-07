import { useState } from "react";
import { ReservationPayments } from "./Payments";
import { Link, useParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../app/context";
import {
  dateLabel,
  eventLabel,
  roomChoiceLabel,
  validVersion,
} from "../../shared/format";
import { phaseLabel } from "../../shared/operations";
import { useOnline } from "../../shared/useOnline";
import { useRooms } from "../rooms/queries";
import { EditReservation } from "./Edit";
import { ReservationPricePanel } from "./PricePanel";
import { StayOperationsPanel, RoomAllocationsPanel } from "./StayOperations";
import {
  Dialog,
  Empty,
  Notice,
  PageHead,
  Pending,
  QueryError,
  SelectField,
} from "../../shared/ui";
export function ReservationDetail() {
  const { reservationId } = useParams();
  return <ReservationDetailPage key={reservationId} />;
}
function ReservationDetailPage() {
  const { reservationId } = useParams();
  const id = Number(reservationId);
  const valid = Number.isSafeInteger(id) && id > 0 && id <= 2147483647;
  const { apis } = useWorkspace();
  const online = useOnline();
  const [editing, setEditing] = useState<{
    kind: "move" | "stay";
    version: number;
    recoveryOnly: boolean;
    snapshot: {
      startDate: string;
      endDate: string;
      guestCount: number;
      roomId: number;
      phase?: string;
    };
  }>();
  const [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const query = useQuery({
    queryKey: ["reservations", id],
    queryFn: ({ signal }) =>
      apis.reservationApi.getReservation({ reservationId: id }, { signal }),
    enabled: valid,
  });
  const history = useInfiniteQuery({
    queryKey: ["reservation-history", id],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      apis.inventoryApi.reservationHistory(
        { reservationId: id, limit: 50, afterId: pageParam },
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: valid,
  });
  const events = history.data?.pages.flatMap((page) => page.items) ?? [];
  const guest = useQuery({
    queryKey: ["guests", query.data?.customerId],
    queryFn: ({ signal }) =>
      apis.customerApi.getCustomer(
        { customerId: query.data!.customerId! },
        { signal },
      ),
    enabled: !!query.data?.customerId,
  });
  const rooms = useRooms();
  const record = query.data;
  const phase =
    record?.phase ??
    (record?.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED");
  const editable = ["CONFIRMED", "CHECKED_IN"].includes(phase);
  const open = (kind: "move" | "stay", recoveryOnly = false) => {
    if (!record || !validVersion(record.version)) return;
    setSaved(false);
    setEditing({
      kind,
      recoveryOnly,
      version: record.version,
      snapshot: {
        startDate: record.startDate!,
        endDate: record.endDate!,
        guestCount: record.guestCount!,
        roomId: record.roomId!,
        phase,
      },
    });
  };
  return (
    <>
      <Link className="back-link" to="/reservations">
        ← Reservations
      </Link>
      <PageHead
        title={valid ? `Reservation #${id}` : "Reservation"}
        actions={
          record ? (
            <>
              {editable && (
                <>
                  <button
                    className="button secondary"
                    disabled={!online}
                    onClick={() => open("stay")}
                  >
                    Edit stay
                  </button>
                  <button
                    className="button secondary"
                    disabled={!online}
                    onClick={() => open("move")}
                  >
                    Move room
                  </button>
                </>
              )}
              <button
                className="text-button"
                disabled={!online}
                onClick={() => open("stay", true)}
              >
                Check previous booking edit
              </button>
            </>
          ) : null
        }
      />
      {saved && (
        <Notice>
          Request confirmed. Review the current reservation below.
        </Notice>
      )}
      {!valid ? (
        <Notice error>This reservation address is invalid.</Notice>
      ) : query.isPending ? (
        <Pending />
      ) : query.isError ? (
        <QueryError retry={() => void query.refetch()} />
      ) : (
        <section className="panel">
          <div className="section-heading">
            <h2>Your stay</h2>
            <span className={`status status-${phase.toLowerCase()}`}>
              {phaseLabel(phase)}
            </span>
          </div>
          <dl className="details">
            <div>
              <dt>Check-in</dt>
              <dd>{dateLabel(record!.startDate)}</dd>
            </div>
            <div>
              <dt>Check-out</dt>
              <dd>{dateLabel(record!.endDate)}</dd>
            </div>
            <div>
              <dt>Guests</dt>
              <dd>{record!.guestCount}</dd>
            </div>
            <div>
              <dt>Nights</dt>
              <dd>{record!.nights}</dd>
            </div>
            <div>
              <dt>Current room</dt>
              <dd>
                {rooms.data?.find((room) => room.id === record!.roomId) ? (
                  <Link to={`/rooms/${record!.roomId}`}>
                    {roomChoiceLabel(
                      rooms.data.find((room) => room.id === record!.roomId)!,
                    )}
                  </Link>
                ) : (
                  `Room ${record!.roomId}`
                )}
              </dd>
            </div>
            <div>
              <dt>Guest</dt>
              <dd>
                {guest.isPending ? (
                  "Loading guest…"
                ) : guest.isError ? (
                  <button
                    className="text-button"
                    onClick={() => void guest.refetch()}
                  >
                    Retry guest details
                  </button>
                ) : (
                  <Link to={`/guests/${guest.data.id}`}>
                    {guest.data.firstName} {guest.data.lastName}
                  </Link>
                )}
              </dd>
            </div>
          </dl>
          {query.isFetching && <Pending label="Refreshing reservation…" />}
        </section>
      )}
      {valid && record && (
        <>
          <StayOperationsPanel reservation={record} />
          <RoomAllocationsPanel reservation={record} />
          <ReservationPricePanel reservation={record} />
          <ReservationPayments id={id} />
        </>
      )}
      {valid && (
        <section className="panel">
          <h2>Reservation history</h2>
          {history.isPending ? (
            <Pending />
          ) : history.isError && !history.data ? (
            <QueryError retry={() => void history.refetch()} />
          ) : !events.length ? (
            <Empty title="No history available" />
          ) : (
            <ol className="history">
              {events.map((event) => (
                <li key={event.id}>
                  <span className="history-dot" aria-hidden="true" />
                  <div>
                    <strong>
                      {event.kind?.replaceAll("_", " ").toLowerCase()}
                    </strong>
                    <p>
                      {eventLabel(event.occurredAt)} ·{" "}
                      {dateLabel(event.startDate)} to {dateLabel(event.endDate)}
                    </p>
                    {event.reason && <p>Reason: {event.reason}</p>}
                    {event.phase && <p>{phaseLabel(event.phase)}</p>}
                    {event.previousRoomId && (
                      <p>
                        Moved from{" "}
                        <Link to={`/rooms/${event.previousRoomId}`}>
                          room #{event.previousRoomId}
                        </Link>{" "}
                        to{" "}
                        <Link to={`/rooms/${event.roomId}`}>
                          room #{event.roomId}
                        </Link>
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {history.isError && history.data && (
            <Notice error>
              More history could not be loaded. Try again below.
            </Notice>
          )}
          {history.hasNextPage && (
            <button
              className="button secondary"
              disabled={history.isFetchingNextPage}
              onClick={() => void history.fetchNextPage()}
            >
              {history.isFetchingNextPage
                ? "Loading events…"
                : "Load more events"}
            </button>
          )}
        </section>
      )}
      {editing && record && (
        <Dialog
          title={
            editing.recoveryOnly || !editable
              ? "Check previous save"
              : editing.kind === "move"
                ? "Move room"
                : "Edit stay"
          }
          busy={busy}
          onClose={() => setEditing(undefined)}
        >
          {(editing.recoveryOnly || !editable) && (
            <SelectField
              label="Previous change"
              value={editing.kind}
              onChange={(event) =>
                setEditing({
                  ...editing,
                  kind: event.target.value === "move" ? "move" : "stay",
                })
              }
            >
              <option value="stay">Stay dates or party size</option>
              <option value="move">Room move</option>
            </SelectField>
          )}
          <EditReservation
            key={editing.kind}
            kind={editing.kind}
            draftKey={`reservation-edit:${id}:${editing.kind}`}
            reservationId={id}
            expectedVersion={editing.version}
            currentVersion={record.version}
            recoveryOnly={editing.recoveryOnly || !editable}
            operational
            record={editing.snapshot}
            rooms={rooms.data ?? []}
            onBusy={setBusy}
            onSaved={() => {
              setEditing(undefined);
              setSaved(true);
            }}
            busy={false}
            message=""
            onSubmit={async () => {}}
          />
        </Dialog>
      )}
    </>
  );
}
