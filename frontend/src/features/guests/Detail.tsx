import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../app/context";
import { dateLabel } from "../../shared/format";
import {
  Empty,
  Notice,
  PageHead,
  Pending,
  QueryError,
  Status,
} from "../../shared/ui";
export function GuestDetail() {
  const { guestId } = useParams();
  const id = Number(guestId);
  const valid = Number.isSafeInteger(id) && id > 0 && id <= 2147483647;
  const { apis } = useWorkspace();
  const guest = useQuery({
    queryKey: ["guests", id],
    queryFn: ({ signal }) =>
      apis.customerApi.getCustomer({ customerId: id }, { signal }),
    enabled: valid,
  });
  const bookings = useQuery({
    queryKey: ["reservations", "guest", id],
    queryFn: ({ signal }) =>
      apis.reservationApi.findReservationsByCustomer(
        { customerId: id },
        { signal },
      ),
    enabled: valid,
  });
  return (
    <>
      <Link className="back-link" to="/guests">
        ← All guests
      </Link>
      <PageHead
        title="Guest details"
        actions={
          valid && guest.data ? (
            <Link className="button" to={`/reservations/new?guest=${id}`}>
              New reservation
            </Link>
          ) : null
        }
      />
      {!valid ? (
        <Notice error>This guest address is invalid.</Notice>
      ) : guest.isPending ? (
        <Pending />
      ) : guest.isError ? (
        <QueryError retry={() => void guest.refetch()} />
      ) : (
        <section className="panel">
          <h2>
            {guest.data.firstName} {guest.data.lastName}
          </h2>
          <dl className="details">
            <div>
              <dt>Phone</dt>
              <dd>{guest.data.phone}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{guest.data.address}</dd>
            </div>
          </dl>
        </section>
      )}
      {valid && (
        <section className="panel">
          <h2>Active reservations</h2>
          {bookings.isPending ? (
            <Pending />
          ) : bookings.isError ? (
            <QueryError retry={() => void bookings.refetch()} />
          ) : !bookings.data.length ? (
            <Empty title="No active reservations" />
          ) : (
            <ul className="record-list">
              {bookings.data.map((booking) => (
                <li key={booking.id}>
                  <div>
                    <Link to={`/reservations/${booking.id}`}>
                      Reservation #{booking.id}
                    </Link>
                    <p>
                      {dateLabel(booking.startDate)} →{" "}
                      {dateLabel(booking.endDate)}
                    </p>
                  </div>
                  <Status value={booking.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
