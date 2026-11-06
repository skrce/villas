import { useContext, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { DraftContext, useWorkspace } from "../../app/context";
import { dateLabel, eventLabel, roomChoiceLabel } from "../../shared/format";
import { useSave } from "../../shared/useSave";
import { useRooms } from "../rooms/queries";
import { EditReservation } from "./Edit";
import { ReservationPricePanel } from "./PricePanel";
import {
  Dialog,
  Empty,
  Notice,
  PageHead,
  Pending,
  QueryError,
  Status,
} from "../../shared/ui";
export function ReservationDetail() {
  const { reservationId } = useParams();
  return <ReservationDetailPage key={reservationId} />;
}
function ReservationDetailPage() {
  const { reservationId } = useParams();
  const id = Number(reservationId);
  const valid = Number.isSafeInteger(id) && id > 0 && id <= 2147483647;
  const { apis, booking } = useWorkspace();
  const [editing, setEditing] = useState<{
    kind: "move" | "stay" | "cancel";
    version: number;
    snapshot: {
      startDate: string;
      endDate: string;
      guestCount: number;
      roomId: number;
    };
  }>();
  const drafts = useContext(DraftContext);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
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
  const open = (kind: "move" | "stay" | "cancel") => {
    if (!record || !Number.isSafeInteger(record.version) || record.version! < 0)
      return;
    mutation.resetStatus();
    setSaved(false);
    setEditing({
      kind,
      version: record.version!,
      snapshot: {
        startDate: record.startDate!,
        endDate: record.endDate!,
        guestCount: record.guestCount!,
        roomId: record.roomId!,
      },
    });
  };
  const mutation = useSave<void>(
    () => booking.cancel(id, editing!.version),
    () => {
      drafts?.delete(`reservation-edit:${id}:${editing?.kind}`);
      setEditing(undefined);
      setSaved(true);
    },
  );
  return (
    <>
      <Link className="back-link" to="/reservations">
        ← Reservations
      </Link>
      <PageHead
        title={valid ? `Reservation #${id}` : "Reservation"}
        actions={
          record?.status === "ACTIVE" ? (
            <>
              <button
                className="button secondary"
                onClick={() => {
                  open("stay");
                }}
              >
                Edit stay
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  open("move");
                }}
              >
                Move room
              </button>
              <button
                className="button danger-outline"
                onClick={() => {
                  open("cancel");
                }}
              >
                Cancel reservation
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
            <Status value={record!.status} />
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
              <dt>Room</dt>
              <dd>
                {rooms.data?.find((room) => room.id === record!.roomId)
                  ? roomChoiceLabel(
                      rooms.data.find((room) => room.id === record!.roomId)!,
                    )
                  : `Room ${record!.roomId}`}
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
      {valid && record && <ReservationPricePanel reservation={record} />}
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
            editing?.kind === "cancel"
              ? "Cancel reservation?"
              : editing?.kind === "move"
                ? "Move room"
                : "Edit stay"
          }
          busy={busy || mutation.isPending}
          onClose={() => setEditing(undefined)}
        >
          <EditReservation
            key={editing.kind}
            kind={editing.kind}
            draftKey={`reservation-edit:${id}:${editing.kind}`}
            reservationId={id}
            expectedVersion={editing.version}
            currentVersion={record.version}
            onBusy={setBusy}
            onSaved={() => {
              setEditing(undefined);
              setSaved(true);
            }}
            record={editing.snapshot}
            rooms={rooms.data ?? []}
            busy={mutation.isPending}
            blocked={mutation.stale}
            message={mutation.message}
            onSubmit={async () => {
              setBusy(true);
              try {
                await mutation.submit();
              } finally {
                setBusy(false);
              }
            }}
          />
        </Dialog>
      )}
    </>
  );
}
