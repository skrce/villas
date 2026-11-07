import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../app/context";
import {
  addDays,
  dateLabel,
  euros,
  eventLabel,
  roomChoiceLabel,
} from "../../shared/format";
import { deskLabel, phaseLabel, type DeskList } from "../../shared/operations";
import { Empty, Notice, PageHead, Pending, QueryError } from "../../shared/ui";
import { useOnline } from "../../shared/useOnline";
import { todaySchema, type Today as TodayData } from "./data";

export function Today() {
  const { apis } = useWorkspace();
  const online = useOnline();
  const query = useQuery({
    queryKey: ["today"],
    queryFn: async ({ signal }) =>
      todaySchema.parse(await apis.reportsApi.today({ signal })),
    staleTime: 0,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const data = query.data;
  return (
    <>
      <PageHead
        title="Today"
        eyebrow="Your property, at a glance"
        actions={
          <>
            <button
              className="button secondary"
              disabled={!online || query.isFetching}
              onClick={() => void query.refetch()}
            >
              Refresh today
            </button>
            <Link className="button" to="/reservations/new">
              New reservation
            </Link>
          </>
        }
      >
        Start with arrivals, departures and the rooms that need attention.
      </PageHead>
      {query.isPending ? (
        <Pending label="Loading today's work…" />
      ) : query.isError && !data ? (
        <QueryError retry={() => void query.refetch()} />
      ) : null}
      {data && (
        <>
          <p className="hint">
            Property day {dateLabel(data.propertyDate)} · Europe/Skopje · Read{" "}
            {eventLabel(new Date(data.readAt))}
          </p>
          {(!online || query.isError) && (
            <Notice error>
              These are previously loaded records. Refresh when connected before
              acting on today's work.
            </Notice>
          )}
          {data.activeRooms === 0 && (
            <Notice>
              No active rooms are configured.{" "}
              <Link to="/rooms">Set up your rooms</Link> to start taking
              bookings.
            </Notice>
          )}
          {data.roomsWithoutRates > 0 && (
            <Notice>
              {data.roomsWithoutRates} active{" "}
              {data.roomsWithoutRates === 1 ? "room needs" : "rooms need"}{" "}
              nightly rates. <Link to="/rooms">Review room setup</Link>.
            </Notice>
          )}
          <section className="today-metrics" aria-label="Daily overview">
            <Metric
              label="Arrivals today"
              value={data.arrivals.count}
              to="/front-desk?list=ARRIVALS"
            />
            <Metric
              label="Departures today"
              value={data.departures.count}
              to="/front-desk?list=DEPARTURES"
            />
            <Metric
              label="Guests staying"
              value={data.guestsInHouse}
              to="/front-desk?list=IN_HOUSE"
            />
            <Metric
              label="Stays needing attention"
              value={data.attention.count}
              to="/front-desk?list=ATTENTION"
            />
          </section>
          <div className="today-grid">
            <Queue title="Arrivals" list="ARRIVALS" queue={data.arrivals} />
            <Queue
              title="Departures"
              list="DEPARTURES"
              queue={data.departures}
            />
            <Queue
              title="In-house stays"
              list="IN_HOUSE"
              queue={data.inHouse}
            />
            <Queue
              title="Late arrivals and overdue departures"
              list="ATTENTION"
              queue={data.attention}
            />
            <section
              className="panel today-section"
              aria-labelledby="today-rooms"
            >
              <div className="section-head">
                <h2 id="today-rooms">Room readiness</h2>
                <Link to="/housekeeping">Open housekeeping</Link>
              </div>
              <dl className="today-readiness">
                <div>
                  <dt>Dirty</dt>
                  <dd>
                    <Link to="/housekeeping?state=DIRTY">
                      {data.dirtyRooms}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt>Cleaning</dt>
                  <dd>
                    <Link to="/housekeeping?state=IN_PROGRESS">
                      {data.cleaningRooms}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt>Inspection</dt>
                  <dd>
                    <Link to="/housekeeping?state=INSPECTION">
                      {data.inspectionRooms}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt>Clean</dt>
                  <dd>
                    <Link to="/housekeeping?state=CLEAN">
                      {data.cleanRooms}
                    </Link>
                  </dd>
                </div>
              </dl>
              <p>
                {data.blockedRooms} of {data.activeRooms} active rooms have
                maintenance blocking tonight.
              </p>
              <Link to={`/calendar?from=${data.propertyDate}`}>
                Review today's room calendar
              </Link>
              <p className="hint">
                Check-in requires a clean, physically vacant room. Maintenance
                and cleaning are separate.
              </p>
            </section>
            <section
              className="panel today-section"
              aria-labelledby="today-balances"
            >
              <div className="section-head">
                <h2 id="today-balances">Money needing attention</h2>
                <Link to="/reports?kind=BALANCES">Open reports</Link>
              </div>
              <dl className="today-money">
                <div>
                  <dt>
                    Known outstanding · {data.balances.outstandingCount}{" "}
                    bookings
                  </dt>
                  <dd>{euros(data.balances.outstandingCents)}</dd>
                </div>
                <div>
                  <dt>Known credit · {data.balances.creditCount} bookings</dt>
                  <dd>{euros(data.balances.creditCents)}</dd>
                </div>
              </dl>
              {data.balances.unknownCount > 0 && (
                <Notice>
                  {data.balances.unknownCount} bookings have unknown prices and
                  balances. The complete outstanding and credit totals are
                  unknown.
                </Notice>
              )}
              <p className="hint">
                Across all bookings, including future and completed stays. Up to
                five examples, with unknown prices first.
              </p>
              <ul className="today-list">
                {data.balances.items.map((row) => (
                  <li key={row.reservationId}>
                    <Link to={`/reservations/${row.reservationId}#payments`}>
                      {row.guestName} · #{row.reservationId}
                    </Link>
                    <span>
                      {row.outstandingCents === null
                        ? "Unknown balance"
                        : row.outstandingCents > 0
                          ? `${euros(row.outstandingCents)} outstanding`
                          : `${euros(row.creditCents ?? 0)} credit`}
                    </span>
                  </li>
                ))}
              </ul>
              {data.balances.items.length === 0 && (
                <p>No current balance needs attention.</p>
              )}
              <Link
                to={`/reports?kind=COLLECTIONS&from=${data.propertyDate}&to=${addDays(data.propertyDate, 1)}`}
              >
                Review today's collections
              </Link>
            </section>
          </div>
        </>
      )}
    </>
  );
}
function Metric({
  label,
  value,
  to,
}: {
  label: string;
  value: number;
  to: string;
}) {
  return (
    <Link className="today-metric" to={to}>
      <span>{label}</span>
      <strong>{value}</strong>
      <span className="hint">Open list →</span>
    </Link>
  );
}
function Queue({
  title,
  list,
  queue,
}: {
  title: string;
  list: DeskList;
  queue: TodayData["arrivals"];
}) {
  return (
    <section className="panel today-section" aria-label={title}>
      <div className="section-head">
        <h2>
          {title} <span className="status">{queue.count}</span>
        </h2>
        <Link to={`/front-desk?list=${list}`}>
          View all {deskLabel(list).toLowerCase()}
        </Link>
      </div>
      {queue.items.length === 0 ? (
        <Empty title="Nothing on this list">
          No matching stays for the current property day.
        </Empty>
      ) : (
        <>
          <p className="hint">
            Showing {queue.items.length} of {queue.count} stays.
          </p>
          <ul className="today-list">
            {queue.items.map(({ reservation: r, ...row }) => (
              <li key={r.id}>
                <Link to={`/reservations/${r.id}`}>
                  {row.guestName} · #{r.id}
                </Link>
                <span>
                  {roomChoiceLabel({
                    id: r.roomId,
                    name: row.roomName,
                    reference: row.roomReference,
                  })}
                </span>
                <span className="hint">
                  {dateLabel(r.startDate)} to {dateLabel(r.endDate)} ·{" "}
                  {phaseLabel(r.phase)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
