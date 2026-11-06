import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { Customer } from "../../api/generated";
import { useWorkspace } from "../../app/context";
import { dateLabel } from "../../shared/format";
import { RecordStatusDialog } from "../../shared/RecordStatusDialog";
import { GuestEditor } from "./Form";
import {
  Dialog,
  Empty,
  Notice,
  PageHead,
  Pending,
  QueryError,
  RecordState,
  Status,
} from "../../shared/ui";

export function GuestDetail() {
  const { guestId } = useParams();
  const id = Number(guestId);
  const valid = Number.isSafeInteger(id) && id > 0 && id <= 2147483647;
  const { apis } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Customer>();
  const guest = useQuery({
    queryKey: ["guests", id],
    queryFn: ({ signal }) =>
      apis.customerApi.getCustomer({ customerId: id }, { signal }),
    enabled: valid,
  });
  const history = useInfiniteQuery({
    queryKey: ["reservations", "guest-history", id],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      apis.customerApi.customerReservations(
        { customerId: id, afterId: pageParam, limit: 20 },
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: valid,
  });
  const name = guest.data
    ? `${guest.data.firstName} ${guest.data.lastName}`
    : "Guest details";
  return (
    <>
      <Link className="back-link" to="/guests">
        ← All guests
      </Link>
      <PageHead
        title={name}
        actions={
          guest.data && (
            <>
              {guest.data.active !== false && (
                <Link className="button" to={`/reservations/new?guest=${id}`}>
                  New reservation
                </Link>
              )}
              <button
                className="button secondary"
                onClick={() => setEditing(true)}
              >
                Edit guest
              </button>
              <button
                className="button quiet"
                onClick={() => setStatusTarget(guest.data)}
              >
                {guest.data.active === false
                  ? "Restore guest"
                  : "Archive guest"}
              </button>
              <button
                className="button quiet"
                disabled={guest.isFetching}
                onClick={() => void guest.refetch()}
              >
                Refresh details
              </button>
            </>
          )
        }
      >
        Guest profile and retained reservation history.
      </PageHead>
      {!valid ? (
        <Notice error>This guest address is invalid.</Notice>
      ) : guest.isPending ? (
        <Pending />
      ) : guest.isError ? (
        <QueryError retry={() => void guest.refetch()} />
      ) : (
        <section className="panel">
          <div className="section-heading">
            <h2>Contact & arrival details</h2>
            <RecordState active={guest.data.active} />
          </div>
          {guest.data.active === false && (
            <Notice>
              This profile is archived. Restore it before creating or changing a
              reservation.
            </Notice>
          )}
          <dl className="details contact-details">
            <div>
              <dt>Phone</dt>
              <dd>{guest.data.phone || "Not provided"}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{guest.data.email || "Not provided"}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{guest.data.address || "Not provided"}</dd>
            </div>
            <div className="full-width">
              <dt>Operational notes</dt>
              <dd className="preserve-lines">
                {guest.data.notes || "No notes"}
              </dd>
            </div>
          </dl>
        </section>
      )}
      {valid && (
        <section className="panel">
          <div className="section-heading">
            <h2>Reservation history</h2>
            <span className="count">Active & cancelled</span>
          </div>
          {history.isPending ? (
            <Pending />
          ) : history.isError ? (
            <QueryError retry={() => void history.refetch()} />
          ) : !history.data.pages.some((page) => page.items.length) ? (
            <Empty title="No reservations yet" />
          ) : (
            <ul className="record-list">
              {history.data.pages
                .flatMap((page) => page.items)
                .map((booking) => (
                  <li key={booking.id}>
                    <div>
                      <Link to={`/reservations/${booking.id}`}>
                        Reservation #{booking.id}
                      </Link>
                      <p>
                        {dateLabel(booking.startDate)} →{" "}
                        {dateLabel(booking.endDate)} · {booking.guestCount}{" "}
                        guests
                      </p>
                    </div>
                    <Status value={booking.status} />
                  </li>
                ))}
            </ul>
          )}
          {history.hasNextPage && (
            <button
              className="button secondary load-more"
              disabled={history.isFetchingNextPage}
              onClick={() => void history.fetchNextPage()}
            >
              {history.isFetchingNextPage
                ? "Loading…"
                : "Load more reservations"}
            </button>
          )}
        </section>
      )}
      {editing && guest.data && (
        <Dialog
          title="Edit guest"
          busy={busy}
          onClose={() => setEditing(false)}
        >
          <GuestEditor
            guest={guest.data}
            onPending={setBusy}
            onSaved={() => setEditing(false)}
          />
        </Dialog>
      )}
      {statusTarget && (
        <RecordStatusDialog
          kind="guest"
          record={statusTarget}
          name={`${statusTarget.firstName} ${statusTarget.lastName}`}
          onClose={() => setStatusTarget(undefined)}
        />
      )}
    </>
  );
}
