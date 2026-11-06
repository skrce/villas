import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Apartment, MaintenanceBlock } from "../../api/generated";
import { useWorkspace } from "../../app/context";
import {
  addDays,
  dateLabel,
  propertyToday,
  roomLabel,
} from "../../shared/format";
import { dateSchema } from "../../shared/schemas";
import { RecordStatusDialog } from "../../shared/RecordStatusDialog";
import { RoomEditor } from "./Form";
import {
  CancelMaintenance,
  MaintenanceForm,
  MaintenanceHistory,
} from "./Maintenance";
import {
  Dialog,
  Empty,
  Field,
  Notice,
  PageHead,
  Pending,
  QueryError,
  RecordState,
  Status,
} from "../../shared/ui";

const periodSchema = z
  .object({ from: dateSchema, to: dateSchema, history: z.boolean() })
  .refine(
    ({ from, to }) =>
      to > from &&
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        86400000 <=
        366,
    {
      path: ["to"],
      message: "Choose an end date after the start, within 366 days.",
    },
  );
type Period = z.infer<typeof periodSchema>;
function PeriodForm({
  initial,
  onApply,
}: {
  initial: Period;
  onApply: (value: Period) => void;
}) {
  const form = useForm<Period>({
    defaultValues: initial,
    resolver: zodResolver(periodSchema),
  });
  return (
    <form
      className="form-row"
      aria-label="Room availability period"
      noValidate
      onSubmit={form.handleSubmit(onApply)}
    >
      <Field
        label="From"
        type="date"
        min="1000-01-01"
        max="9999-12-31"
        {...form.register("from")}
        error={form.formState.errors.from?.message}
      />
      <Field
        label="To"
        type="date"
        min="1000-01-01"
        max="9999-12-31"
        {...form.register("to")}
        error={form.formState.errors.to?.message}
      />
      <label className="checkbox-field">
        <input type="checkbox" {...form.register("history")} />
        Include cancelled history
      </label>
      <button className="button secondary">Apply period</button>
    </form>
  );
}
export function RoomDetail() {
  const { roomId } = useParams();
  const id = Number(roomId);
  const valid = Number.isSafeInteger(id) && id > 0 && id <= 2147483647;
  const { apis } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const today = propertyToday();
  const period = {
    from: params.get("from") ?? today,
    to: params.get("to") ?? addDays(today, 30),
    history: params.get("history") === "1",
  };
  const windowValid = periodSchema.safeParse(period).success;
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmedBlock, setConfirmedBlock] = useState<number>();
  const [statusTarget, setStatusTarget] = useState<Apartment>();
  const [cancelling, setCancelling] = useState<MaintenanceBlock>();
  const [eventTarget, setEventTarget] = useState<MaintenanceBlock>();
  const room = useQuery({
    queryKey: ["rooms", id],
    queryFn: ({ signal }) =>
      apis.apartmentApi.getApartment({ apartmentId: id }, { signal }),
    enabled: valid,
  });
  const stays = useInfiniteQuery({
    queryKey: ["reservations", "room", id, period],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      apis.inventoryApi.listReservations(
        {
          startDate: period.from,
          endDate: period.to,
          status: period.history ? undefined : "ACTIVE",
          roomId: id,
          afterId: pageParam,
          limit: 30,
        },
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: valid && windowValid && !!room.data,
  });
  const maintenance = useInfiniteQuery({
    queryKey: ["maintenance", "room", id, period],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      apis.inventoryApi.listMaintenanceBlocks(
        {
          startDate: period.from,
          endDate: period.to,
          status: period.history ? undefined : "ACTIVE",
          roomId: id,
          afterId: pageParam,
          limit: 30,
        },
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: valid && windowValid && !!room.data,
  });
  const bookings = stays.data?.pages.flatMap((page) => page.items) ?? [];
  const blocks = maintenance.data?.pages.flatMap((page) => page.items) ?? [];
  const occupied =
    bookings.some((booking) => booking.status === "ACTIVE") ||
    blocks.some((block) => block.status === "ACTIVE");
  const checked =
    stays.isSuccess &&
    maintenance.isSuccess &&
    !stays.isFetching &&
    !maintenance.isFetching;
  return (
    <>
      <Link className="back-link" to="/rooms">
        ← All rooms
      </Link>
      <PageHead
        title={room.data ? roomLabel(room.data) : "Room details"}
        eyebrow={room.data?.reference}
        actions={
          room.data && (
            <>
              <button
                className="button secondary"
                onClick={() => setEditing(true)}
              >
                Edit room
              </button>
              <button
                className="button quiet"
                onClick={() => setStatusTarget(room.data)}
              >
                {room.data.active === false ? "Restore room" : "Archive room"}
              </button>
              <button
                className="button quiet"
                disabled={room.isFetching}
                onClick={() => void room.refetch()}
              >
                Refresh details
              </button>
            </>
          )
        }
      >
        Room details and availability in Skopje property time.
      </PageHead>
      {confirmedBlock && (
        <Notice>
          Maintenance #{confirmedBlock} is saved. Review its current status
          below.
        </Notice>
      )}
      {!valid ? (
        <Notice error>This room address is invalid.</Notice>
      ) : room.isPending ? (
        <Pending />
      ) : room.isError ? (
        <QueryError retry={() => void room.refetch()} />
      ) : (
        <>
          <section className="panel">
            <div className="section-heading">
              <h2>Room profile</h2>
              <RecordState active={room.data.active} />
            </div>
            <dl className="details">
              <div>
                <dt>Capacity</dt>
                <dd>Up to {room.data.capacity} guests</dd>
              </div>
              <div>
                <dt>Beds</dt>
                <dd>{room.data.bedConfiguration || "Not specified"}</dd>
              </div>
              <div>
                <dt>Orientation</dt>
                <dd>{room.data.orientation || "Not specified"}</dd>
              </div>
              <div>
                <dt>View</dt>
                <dd>{room.data.view || "Not specified"}</dd>
              </div>
              <div>
                <dt>Floor</dt>
                <dd>{room.data.floor || "Not specified"}</dd>
              </div>
              <div className="full-width">
                <dt>Amenities</dt>
                <dd>{room.data.features || "Not specified"}</dd>
              </div>
            </dl>
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>Availability & maintenance</h2>
              <button
                className={`button${room.data.active === false ? " secondary" : ""}`}
                onClick={() => setAdding(true)}
              >
                {room.data.active === false
                  ? "Check interrupted maintenance save"
                  : "Block for maintenance"}
              </button>
            </div>
            <PeriodForm
              key={JSON.stringify(period)}
              initial={period}
              onApply={(values) =>
                setParams({
                  from: values.from,
                  to: values.to,
                  ...(values.history ? { history: "1" } : {}),
                })
              }
            />
            {!windowValid ? (
              <Notice error>
                Choose valid dates spanning at most 366 days.{" "}
                <button
                  className="button secondary"
                  onClick={() => setParams({})}
                >
                  Reset period
                </button>
              </Notice>
            ) : (
              checked && (
                <p className="availability-note" role="status">
                  {room.data.active === false
                    ? "This room is archived. Restore it before creating new stays or maintenance."
                    : occupied
                      ? "Active reservations or maintenance occupy part of this period."
                      : stays.hasNextPage || maintenance.hasNextPage
                        ? "Load the remaining records to review this period."
                        : "No active reservations or maintenance in this period."}{" "}
                  Availability is checked again when you save.
                </p>
              )
            )}
          </section>
          {windowValid && (
            <div className="record-columns">
              <section className="panel">
                <h2>Reservations in this period</h2>
                {stays.isPending ? (
                  <Pending />
                ) : stays.isError ? (
                  <QueryError retry={() => void stays.refetch()} />
                ) : !bookings.length ? (
                  <Empty title="No reservations in this period" />
                ) : (
                  <ul className="record-list">
                    {bookings.map((booking) => (
                      <li key={booking.id}>
                        <div>
                          <Link to={`/reservations/${booking.id}`}>
                            Reservation #{booking.id}
                          </Link>
                          <p>
                            {dateLabel(booking.startDate)} →{" "}
                            {dateLabel(booking.endDate)}
                          </p>
                          <small>{booking.guestCount} guests</small>
                        </div>
                        <Status value={booking.status} />
                      </li>
                    ))}
                  </ul>
                )}
                {stays.hasNextPage && (
                  <button
                    className="button secondary load-more"
                    disabled={stays.isFetchingNextPage}
                    onClick={() => void stays.fetchNextPage()}
                  >
                    Load more reservations
                  </button>
                )}
              </section>
              <section className="panel">
                <h2>Maintenance blocks</h2>
                {maintenance.isPending ? (
                  <Pending />
                ) : maintenance.isError ? (
                  <QueryError retry={() => void maintenance.refetch()} />
                ) : !blocks.length ? (
                  <Empty title="No maintenance in this period" />
                ) : (
                  <ul className="record-list">
                    {blocks.map((block) => (
                      <li key={block.id}>
                        <div>
                          <strong>{block.reason}</strong>
                          <p>
                            {dateLabel(block.startDate)} →{" "}
                            {dateLabel(block.endDate)}
                          </p>
                          <Status value={block.status} />
                          <div className="record-actions">
                            <button
                              className="text-link"
                              aria-label={`History for ${block.reason}`}
                              onClick={() => setEventTarget(block)}
                            >
                              History
                              <span className="sr-only">
                                {" "}
                                for {block.reason}
                              </span>
                            </button>
                            {block.status === "ACTIVE" && (
                              <button
                                className="text-link"
                                aria-label={`Cancel block for ${block.reason}`}
                                onClick={() => setCancelling(block)}
                              >
                                Cancel block
                                <span className="sr-only"> {block.reason}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {maintenance.hasNextPage && (
                  <button
                    className="button secondary load-more"
                    disabled={maintenance.isFetchingNextPage}
                    onClick={() => void maintenance.fetchNextPage()}
                  >
                    Load more blocks
                  </button>
                )}
              </section>
            </div>
          )}
        </>
      )}
      {editing && room.data && (
        <Dialog title="Edit room" busy={busy} onClose={() => setEditing(false)}>
          <RoomEditor
            room={room.data}
            onPending={setBusy}
            onSaved={() => setEditing(false)}
          />
        </Dialog>
      )}
      {adding && (
        <Dialog
          title={
            room.data?.active === false
              ? "Check interrupted maintenance save"
              : "Block for maintenance"
          }
          busy={busy}
          onClose={() => setAdding(false)}
        >
          <MaintenanceForm
            roomId={id}
            recoveryOnly={room.data?.active === false}
            from={windowValid ? period.from : today}
            to={windowValid ? period.to : addDays(today, 1)}
            onPending={setBusy}
            onSaved={(blockId, from, to) => {
              setConfirmedBlock(blockId);
              setAdding(false);
              setParams({
                from,
                to:
                  (Date.parse(`${to}T00:00:00Z`) -
                    Date.parse(`${from}T00:00:00Z`)) /
                    86400000 >
                  366
                    ? addDays(from, 366)
                    : to,
                history: "1",
              });
            }}
          />
        </Dialog>
      )}
      {statusTarget && (
        <RecordStatusDialog
          kind="room"
          record={statusTarget}
          name={roomLabel(statusTarget)}
          onClose={() => setStatusTarget(undefined)}
        />
      )}
      {cancelling && (
        <CancelMaintenance
          block={cancelling}
          onClose={() => setCancelling(undefined)}
        />
      )}
      {eventTarget && (
        <MaintenanceHistory
          block={eventTarget}
          onClose={() => setEventTarget(undefined)}
        />
      )}
    </>
  );
}
