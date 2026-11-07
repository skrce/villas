import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useWorkspace } from "../../app/context";
import { OperationRecoveryError } from "../../api/bookingActions";
import {
  addDays,
  dateLabel,
  eventLabel,
  roomChoiceLabel,
} from "../../shared/format";
import {
  actionLabel,
  housekeepingSchema,
  nextState,
  readinessHistorySchema,
  readinessSchema,
  readinessStates,
  stateLabel,
  type HousekeepingRoom,
  type ReadinessState,
} from "../../shared/operations";
import { useOnline } from "../../shared/useOnline";
import { useSave } from "../../shared/useSave";
import { useVersionedDraft } from "../../shared/useVersionedDraft";
import {
  Dialog,
  Empty,
  Notice,
  PageHead,
  Pending,
  QueryError,
  SelectField,
  TextArea,
} from "../../shared/ui";

type Selection = {
  room: HousekeepingRoom;
  target: ReadinessState;
  recoveryOnly: boolean;
};
export function Housekeeping() {
  const { apis } = useWorkspace();
  const cache = useQueryClient();
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const filter = params.get("state") ?? "";
  const valid =
    filter === "" || readinessStates.includes(filter as ReadinessState);
  const [selected, setSelected] = useState<Selection>();
  const [saved, setSaved] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ["housekeeping", filter],
    enabled: valid,
    initialPageParam: {
      afterId: 0,
      expectedDate: undefined as string | undefined,
    },
    queryFn: async ({ signal, pageParam }) => {
      const page = housekeepingSchema.parse(
        await apis.operationsApi.housekeeping(
          {
            ...pageParam,
            limit: 20,
            state: filter ? (filter as ReadinessState) : undefined,
          },
          { signal },
        ),
      );
      if (
        (pageParam.expectedDate &&
          page.propertyDate !== pageParam.expectedDate) ||
        page.rooms.some(
          (row) =>
            row.roomId <= pageParam.afterId ||
            (filter && row.readiness.state !== filter),
        )
      )
        throw new Error("The room list could not be verified.");
      return page;
    },
    getNextPageParam: (page) =>
      page.nextCursor
        ? { afterId: page.nextCursor, expectedDate: page.propertyDate }
        : undefined,
  });
  const rooms = query.data?.pages.flatMap((page) => page.rooms) ?? [];
  const day = query.data?.pages[0];
  const fresh = online && !query.isFetching && !query.isError;
  const open = (
    room: HousekeepingRoom,
    target: ReadinessState,
    recoveryOnly = false,
  ) => {
    setSaved(false);
    setSelected({ room, target, recoveryOnly });
  };
  const current =
    rooms.find((room) => room.roomId === selected?.room.roomId) ??
    selected?.room;
  return (
    <>
      <PageHead title="Housekeeping" eyebrow="Room operations">
        Clean, inspect and prepare rooms for the next stay.
      </PageHead>
      <section className="panel filters" aria-label="Housekeeping filters">
        <SelectField
          label="Readiness"
          value={filter}
          onChange={(event) =>
            setParams(event.target.value ? { state: event.target.value } : {})
          }
        >
          <option value="">All rooms</option>
          {readinessStates.map((state) => (
            <option key={state} value={state}>
              {stateLabel(state)}
            </option>
          ))}
        </SelectField>
        <button
          className="button secondary"
          disabled={query.isFetching || !online}
          onClick={() =>
            void cache.resetQueries({
              queryKey: ["housekeeping", filter],
              exact: true,
            })
          }
        >
          Refresh rooms
        </button>
      </section>
      {day && (
        <p className="hint">
          Property day {dateLabel(day.propertyDate)} · Maintenance shown through{" "}
          {dateLabel(addDays(day.maintenanceUntil, -1))}
        </p>
      )}
      {saved && (
        <Notice>
          Readiness save confirmed. The current room state is shown below.
        </Notice>
      )}
      {!online && (
        <Notice error>
          You are offline. Reconnect before changing readiness or checking a
          save.
        </Notice>
      )}
      {!valid ? (
        <Notice error>
          This readiness filter is invalid. Choose a state above.
        </Notice>
      ) : query.isPending ? (
        <Pending />
      ) : query.isError && !query.data ? (
        <QueryError retry={() => void query.refetch()} />
      ) : rooms.length === 0 ? (
        <Empty title="No rooms match">
          Add rooms or choose another readiness state.
        </Empty>
      ) : (
        <div className="housekeeping-grid">
          {rooms.map((room) => (
            <article className="panel housekeeping-card" key={room.roomId}>
              <div className="section-heading">
                <h2>
                  {roomChoiceLabel({
                    id: room.roomId,
                    name: room.name,
                    reference: room.reference,
                  })}
                </h2>
                <span
                  className={`status readiness-${room.readiness.state.toLowerCase()}`}
                >
                  {stateLabel(room.readiness.state)}
                </span>
              </div>
              <p className={room.occupied ? "occupancy-note" : "hint"}>
                {room.occupied
                  ? "Occupied. Record departure before changing readiness."
                  : "No guest is checked in."}
              </p>
              {room.maintenance.length > 0 && (
                <div className="room-maintenance">
                  <h3>Dated maintenance</h3>
                  {room.maintenance.map((block) => (
                    <p key={block.id}>
                      {dateLabel(block.startDate)} to {dateLabel(block.endDate)}{" "}
                      · {block.reason}
                    </p>
                  ))}
                </div>
              )}
              <div className="actions">
                {nextState(room.readiness.state) && (
                  <button
                    className="button"
                    disabled={!fresh || room.occupied}
                    onClick={() => open(room, nextState(room.readiness.state)!)}
                  >
                    {actionLabel(nextState(room.readiness.state)!)}
                  </button>
                )}
                {room.readiness.state !== "DIRTY" && (
                  <button
                    className="button secondary"
                    disabled={!fresh || room.occupied}
                    onClick={() => open(room, "DIRTY")}
                  >
                    Mark dirty
                  </button>
                )}
                <button
                  className="text-button"
                  disabled={!online}
                  onClick={() => open(room, "IN_PROGRESS", true)}
                >
                  Check previous save
                </button>
                <Link to={`/rooms/${room.roomId}#readiness`}>
                  Room and readiness history
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
      {query.isError && query.data && (
        <Notice error>
          The list could not be refreshed. Refresh rooms before changing
          readiness. A new property day requires a fresh first page.
        </Notice>
      )}
      {query.hasNextPage && (
        <button
          className="button secondary"
          disabled={query.isFetchingNextPage || !online}
          onClick={() => void query.fetchNextPage()}
        >
          Load more rooms
        </button>
      )}
      {selected && current && (
        <ReadinessDialog
          key={`${selected.room.roomId}:${selected.target}:${selected.recoveryOnly}`}
          room={current}
          target={selected.target}
          expectedVersion={selected.room.readiness.version}
          recoveryOnly={selected.recoveryOnly || current.occupied || !fresh}
          onTarget={(target) => setSelected({ ...selected, target })}
          onClose={() => setSelected(undefined)}
          onSaved={() => {
            setSelected(undefined);
            setSaved(true);
          }}
        />
      )}
    </>
  );
}

function ReadinessDialog({
  room,
  target,
  expectedVersion,
  recoveryOnly,
  onTarget,
  onClose,
  onSaved,
}: {
  room: HousekeepingRoom;
  target: ReadinessState;
  expectedVersion: number;
  recoveryOnly: boolean;
  onTarget: (state: ReadinessState) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { apis, booking } = useWorkspace();
  const cache = useQueryClient();
  const online = useOnline();
  const draft = useVersionedDraft(
    `readiness:${room.roomId}:${target}`,
    { reason: "" },
    expectedVersion,
  );
  const [reason, setReason] = useState(draft.initial.reason);
  const [message, setMessage] = useState("");
  useEffect(() => {
    draft.save({ reason });
  }, [draft, reason]);
  const save = useSave<boolean>(
    (check) =>
      booking.changeReadiness(
        room.roomId,
        target,
        reason,
        draft.expectedVersion,
        check,
      ),
    () => {
      draft.clear();
      onSaved();
    },
  );
  const reload = useSave<void>(
    async () =>
      readinessSchema.parse(
        await apis.operationsApi.roomReadiness({ roomId: room.roomId }),
      ),
    (result) => {
      const data = readinessSchema.parse(result);
      const cached = cache.getQueryData<
        ReturnType<typeof readinessSchema.parse>
      >(["room-readiness", room.roomId]);
      const boards = cache.getQueriesData<{
        pages: ReturnType<typeof housekeepingSchema.parse>[];
      }>({ queryKey: ["housekeeping"] });
      const highest = Math.max(
        cached?.version ?? -1,
        ...boards.flatMap(
          ([, board]) =>
            board?.pages.flatMap((page) =>
              page.rooms
                .filter((row) => row.roomId === room.roomId)
                .map((row) => row.readiness.version),
            ) ?? [],
        ),
      );
      if (data.roomId !== room.roomId || highest > data.version)
        throw new OperationRecoveryError(
          "A newer room state is already loaded. Load the current state again.",
        );
      cache.setQueryData(["room-readiness", room.roomId], data);
      draft.reload({ reason }, data.version);
      save.resetStatus();
      setMessage("");
    },
    { repeatable: true },
  );
  const busy = save.isPending || reload.isPending;
  const stale = draft.expectedVersion !== room.readiness.version;
  const submit = (check: boolean) => {
    if (reason.length > 500 || (target === "DIRTY" && !reason.trim())) {
      setMessage(
        "Enter a reason of up to 500 characters for marking a room dirty.",
      );
      return;
    }
    if (
      !check &&
      (recoveryOnly ||
        stale ||
        room.occupied ||
        room.readiness.state === target)
    )
      return;
    void save.submit(check);
  };
  return (
    <Dialog
      title={
        recoveryOnly
          ? "Check previous readiness save"
          : "Confirm room readiness"
      }
      busy={busy}
      onClose={onClose}
    >
      <form
        aria-label="Room readiness"
        onSubmit={(event) => {
          event.preventDefault();
          submit(false);
        }}
      >
        <p>
          <strong>
            {roomChoiceLabel({
              id: room.roomId,
              name: room.name,
              reference: room.reference,
            })}
          </strong>
        </p>
        {recoveryOnly ? (
          <SelectField
            label="Previous target state"
            value={target}
            disabled={busy}
            onChange={(event) => onTarget(event.target.value as ReadinessState)}
          >
            {readinessStates.map((state) => (
              <option key={state} value={state}>
                {stateLabel(state)}
              </option>
            ))}
          </SelectField>
        ) : (
          <p>
            Record this room as {stateLabel(target).toLowerCase()}. Confirm only
            after the work is complete.
          </p>
        )}
        <TextArea
          label={target === "DIRTY" ? "Reason" : "Reason, optional"}
          value={reason}
          maxLength={500}
          disabled={busy}
          onChange={(event) => {
            setReason(event.target.value);
            setMessage("");
            save.resetStatus();
          }}
        />
        {(stale || save.stale) && (
          <Notice error>
            The room state changed. Check a previous save first, then load the
            current state before a new confirmation.
          </Notice>
        )}
        {message && <Notice error>{message}</Notice>}
        {save.message && <Notice error>{save.message}</Notice>}
        {reload.message && <Notice error>{reload.message}</Notice>}
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy || !online}
            onClick={() => submit(true)}
          >
            Check previous save
          </button>
          {!recoveryOnly && (
            <>
              <button
                type="button"
                className="text-button"
                disabled={busy || !online}
                onClick={() => void reload.submit()}
              >
                Load current state
              </button>
              <button
                className="button"
                disabled={
                  busy ||
                  !online ||
                  stale ||
                  save.stale ||
                  room.occupied ||
                  room.readiness.state === target
                }
              >
                {busy ? "Confirming…" : "Confirm readiness"}
              </button>
            </>
          )}
        </div>
      </form>
    </Dialog>
  );
}

export function RoomReadinessPanel({
  roomId,
  name,
  reference,
}: {
  roomId: number;
  name?: string | null;
  reference?: string | null;
}) {
  const { apis } = useWorkspace();
  const online = useOnline();
  const [target, setTarget] = useState<ReadinessState>();
  const [saved, setSaved] = useState(false);
  const query = useQuery({
    queryKey: ["room-readiness", roomId],
    queryFn: async ({ signal }) => {
      const data = readinessSchema.parse(
        await apis.operationsApi.roomReadiness({ roomId }, { signal }),
      );
      if (data.roomId !== roomId)
        throw new Error("The room state could not be verified.");
      return data;
    },
  });
  const history = useInfiniteQuery({
    queryKey: ["readiness-history", roomId],
    initialPageParam: "0",
    queryFn: async ({ signal, pageParam }) =>
      readinessHistorySchema.parse(
        await apis.operationsApi.roomReadinessHistory(
          { roomId, afterId: pageParam, limit: 50 },
          { signal },
        ),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  return (
    <section className="panel" id="readiness">
      <div className="section-heading">
        <h2>Readiness history</h2>
        <Link to="/housekeeping">Open housekeeping</Link>
      </div>
      {saved && (
        <Notice>
          Previous readiness save confirmed. Review the current state below.
        </Notice>
      )}
      {query.isPending ? (
        <Pending />
      ) : query.isError ? (
        <QueryError retry={() => void query.refetch()} />
      ) : (
        <>
          <p>Current state: {stateLabel(query.data.state)}</p>
          <button
            className="button secondary"
            disabled={!online}
            onClick={() => {
              setSaved(false);
              setTarget("IN_PROGRESS");
            }}
          >
            Check previous readiness save
          </button>
        </>
      )}
      {history.isPending ? (
        <Pending />
      ) : history.isError && !history.data ? (
        <QueryError retry={() => void history.refetch()} />
      ) : (
        <ol className="history">
          {history.data?.pages
            .flatMap((page) => page.items)
            .map((event) => (
              <li key={event.id}>
                <span className="history-dot" aria-hidden="true" />
                <div>
                  <strong>
                    {stateLabel(event.previousState)} to{" "}
                    {stateLabel(event.state)}
                  </strong>
                  <p>{eventLabel(event.occurredAt)}</p>
                  {event.reason && <p>Reason: {event.reason}</p>}
                </div>
              </li>
            ))}
        </ol>
      )}
      {history.isError && history.data && (
        <Notice error>More readiness history could not be loaded.</Notice>
      )}
      {history.hasNextPage && (
        <button
          className="button secondary"
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          Load more readiness events
        </button>
      )}
      {target && query.data && (
        <ReadinessDialog
          key={target}
          room={{
            roomId,
            name: name ?? "",
            reference: reference ?? "",
            occupied: false,
            readiness: query.data,
            maintenance: [],
          }}
          target={target}
          expectedVersion={query.data.version}
          recoveryOnly
          onTarget={setTarget}
          onClose={() => setTarget(undefined)}
          onSaved={() => {
            setTarget(undefined);
            setSaved(true);
          }}
        />
      )}
    </section>
  );
}
