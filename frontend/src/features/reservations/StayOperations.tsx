import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  PendingIntentMissingError,
  OperationRecoveryError,
} from "../../api/bookingActions";
import type { ReservationInfo } from "../../api/generated";
import { useWorkspace } from "../../app/context";
import {
  dateLabel,
  euros,
  eventLabel,
  validVersion,
} from "../../shared/format";
import { ledgerSummarySchema } from "../../shared/ledger";
import {
  phaseLabel,
  readinessSchema,
  stateLabel,
} from "../../shared/operations";
import {
  actionTitle,
  allocationsSchema,
  localTime,
  operationalStaySchema,
  timeOptionsSchema,
  type StayAction,
} from "../../shared/stays";
import {
  Dialog,
  Field,
  Notice,
  Pending,
  QueryError,
  SelectField,
  Table,
  TextArea,
} from "../../shared/ui";
import { useOnline } from "../../shared/useOnline";
import { useSave } from "../../shared/useSave";
import { useVersionedDraft } from "../../shared/useVersionedDraft";

function PropertyTimeFields({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [date = "", time = ""] = value.split("T");
  return (
    <div className="form-grid">
      <Field
        label={`${label} date`}
        type="date"
        min="1000-01-01"
        max="9999-12-31"
        value={date}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            event.target.value || time ? `${event.target.value}T${time}` : "",
          )
        }
      />
      <Field
        label={`${label} time`}
        type="text"
        placeholder="11:00:00"
        maxLength={15}
        hint="24-hour property time. Optional fractional seconds are retained."
        value={time}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            date || event.target.value ? `${date}T${event.target.value}` : "",
          )
        }
      />
    </div>
  );
}
type Context = {
  stay: ReturnType<typeof operationalStaySchema.parse>;
  balance: ReturnType<typeof ledgerSummarySchema.parse>;
  ready: ReturnType<typeof readinessSchema.parse>;
};
export function StayOperationsPanel({
  reservation,
}: {
  reservation: ReservationInfo;
}) {
  const { apis } = useWorkspace();
  const cache = useQueryClient();
  const online = useOnline();
  const id = reservation.id!;
  const [selection, setSelection] = useState<{
    kind: StayAction["kind"];
    recoveryOnly: boolean;
  }>();
  const [saved, setSaved] = useState(false);
  const balance = useQuery({
    queryKey: ["ledger", id],
    queryFn: async ({ signal }) => {
      const data = ledgerSummarySchema.parse(
        await apis.paymentsApi.reservationLedger({ id }, { signal }),
      );
      if (data.reservation.id !== id)
        throw new OperationRecoveryError(
          "The stay balance could not be verified.",
        );
      const current = cache.getQueryData<
        ReturnType<typeof ledgerSummarySchema.parse>
      >(["ledger", id]);
      return current && current.reservation.version > data.reservation.version
        ? current
        : data;
    },
  });
  const day = balance.data?.propertyDate;
  const phase =
    reservation.phase ??
    (reservation.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED");
  const fresh =
    !!day &&
    !balance.isError &&
    !balance.isFetching &&
    balance.data?.reservation.version === reservation.version;
  const open = (kind: StayAction["kind"], recoveryOnly = false) => {
    setSaved(false);
    setSelection({ kind, recoveryOnly });
  };
  return (
    <section
      className="panel"
      id="stay-operations"
      aria-label="Stay operations"
    >
      <div className="section-heading">
        <h2>Stay operations</h2>
        <span className={`status status-${phase.toLowerCase()}`}>
          {phaseLabel(phase)}
        </span>
      </div>
      {day && (
        <p className="hint">Property day {dateLabel(day)} · Europe/Skopje</p>
      )}
      {saved && (
        <Notice>
          Stay action confirmed. Review the current stay and balance below.
        </Notice>
      )}
      <dl className="details">
        <div>
          <dt>Actual arrival</dt>
          <dd>
            {reservation.checkedInAt
              ? eventLabel(new Date(reservation.checkedInAt))
              : "Not recorded"}
          </dd>
        </div>
        <div>
          <dt>Actual departure</dt>
          <dd>
            {reservation.checkedOutAt
              ? eventLabel(new Date(reservation.checkedOutAt))
              : "Not recorded"}
          </dd>
        </div>
      </dl>
      {balance.isPending ? (
        <Pending label="Loading operating day…" />
      ) : balance.isError ? (
        <QueryError retry={() => void balance.refetch()} />
      ) : null}
      {!fresh && balance.data && (
        <Notice>
          Refresh the stay and current balance before a new action.
        </Notice>
      )}
      {phase === "CONFIRMED" &&
        day &&
        (day < reservation.startDate! || day >= reservation.endDate!) && (
          <p className="hint">
            Check-in is available within the booked dates, before departure day.
            Accept a date change first if needed.
          </p>
        )}
      {phase === "CHECKED_IN" && day !== reservation.endDate && (
        <p className="hint">
          Checkout is available on the booked departure date. Accept an early or
          late departure date change first.
        </p>
      )}
      <div className="dialog-actions">
        {phase === "CONFIRMED" && (
          <>
            <button
              className="button"
              disabled={
                !online ||
                !fresh ||
                day! < reservation.startDate! ||
                day! >= reservation.endDate!
              }
              onClick={() => open("CHECK_IN")}
            >
              Check in guest
            </button>
            <button
              className="button secondary"
              disabled={!online || !fresh || day! <= reservation.startDate!}
              onClick={() => open("NO_SHOW")}
            >
              Record no-show
            </button>
            <button
              className="button danger-outline"
              disabled={!online || !fresh}
              onClick={() => open("CANCEL")}
            >
              Cancel reservation
            </button>
          </>
        )}
        {phase === "CHECKED_IN" && (
          <button
            className="button"
            disabled={!online || !fresh || day !== reservation.endDate}
            onClick={() => open("CHECK_OUT")}
          >
            Check out guest
          </button>
        )}
        {["CHECKED_IN", "CHECKED_OUT"].includes(phase) && (
          <button
            className="button secondary"
            disabled={!online || !fresh}
            onClick={() => open("CORRECT_STAY")}
          >
            Correct actual times
          </button>
        )}
        <button
          className="text-button"
          disabled={!online}
          onClick={() => open("CHECK_IN", true)}
        >
          Check previous stay action
        </button>
      </div>
      {selection && (
        <StayActionDialog
          key={`${id}:${selection.kind}:${selection.recoveryOnly}`}
          reservation={reservation}
          currentBalance={balance.data}
          kind={selection.kind}
          recoveryOnly={selection.recoveryOnly}
          onKind={(kind) => setSelection({ ...selection, kind })}
          onClose={() => setSelection(undefined)}
          onSaved={() => {
            setSelection(undefined);
            setSaved(true);
          }}
        />
      )}
    </section>
  );
}
function StayActionDialog({
  reservation,
  currentBalance,
  kind,
  recoveryOnly,
  onKind,
  onClose,
  onSaved,
}: {
  reservation: ReservationInfo;
  currentBalance?: ReturnType<typeof ledgerSummarySchema.parse>;
  kind: StayAction["kind"];
  recoveryOnly: boolean;
  onKind: (kind: StayAction["kind"]) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { apis, booking } = useWorkspace();
  const cache = useQueryClient();
  const online = useOnline();
  const id = reservation.id!;
  const draft = useVersionedDraft(
    `stay-action:${id}:${kind}`,
    {
      reason: "",
      ack: false,
      arrival: localTime(reservation.checkedInAt),
      departure: localTime(reservation.checkedOutAt),
      arrivalUtc: reservation.checkedInAt ?? "",
      departureUtc: reservation.checkedOutAt ?? "",
    },
    reservation.version,
  );
  const [fields, setFields] = useState(draft.initial);
  const [options, setOptions] = useState<{
    arrival: ReturnType<typeof timeOptionsSchema.parse>;
    departure?: ReturnType<typeof timeOptionsSchema.parse>;
  }>();
  const [reviewed, setReviewed] = useState<{
    identity: string;
    context: Context;
    action: StayAction;
  }>();
  const [message, setMessage] = useState("");
  useEffect(() => {
    draft.save(fields);
  }, [draft, fields]);
  const identity = JSON.stringify([
    fields.reason.trim(),
    fields.ack,
    fields.arrival,
    fields.departure,
    fields.arrivalUtc,
    fields.departureUtc,
    draft.expectedVersion,
  ]);
  const change = (next: Partial<typeof fields>) => {
    setFields({ ...fields, ...next });
    setMessage("");
  };
  const requiredReason = ["CANCEL", "NO_SHOW", "CORRECT_STAY"].includes(kind);
  const action = (): StayAction => {
    if (
      fields.reason.length > 500 ||
      (requiredReason &&
        !(recoveryOnly && kind === "CANCEL") &&
        !fields.reason.trim())
    )
      throw new OperationRecoveryError(
        "Enter a reason of up to 500 characters.",
      );
    if (kind === "CHECK_IN") return { kind };
    if (kind === "CHECK_OUT")
      return { kind, acknowledgeBalance: fields.ack, reason: fields.reason };
    if (kind === "CORRECT_STAY") {
      if (!fields.arrivalUtc || (!!fields.departure && !fields.departureUtc))
        throw new OperationRecoveryError(
          "Resolve the property times and choose an offset before continuing.",
        );
      return {
        kind,
        checkedInAt: fields.arrivalUtc,
        checkedOutAt: fields.departureUtc || undefined,
        reason: fields.reason,
      };
    }
    return { kind, reason: fields.reason };
  };
  const loadContext = async (): Promise<Context> => {
    const [record, summary] = await Promise.all([
      apis.reservationApi.getReservation({ reservationId: id }),
      apis.paymentsApi.reservationLedger({ id }),
    ]);
    const stay = operationalStaySchema.parse(record),
      balance = ledgerSummarySchema.parse(summary);
    if (
      stay.id !== id ||
      balance.reservation.id !== id ||
      stay.version !== balance.reservation.version
    )
      throw new OperationRecoveryError(
        "The stay changed while loading. Load the current stay again.",
      );
    const ready = readinessSchema.parse(
      await apis.operationsApi.roomReadiness({ roomId: stay.roomId }),
    );
    if (ready.roomId !== stay.roomId)
      throw new OperationRecoveryError(
        "The current room readiness could not be verified.",
      );
    return { stay, balance, ready };
  };
  const newest = (context: Context) => {
    const record = cache.getQueryData<ReservationInfo>(["reservations", id]);
    const balance = cache.getQueryData<
      ReturnType<typeof ledgerSummarySchema.parse>
    >(["ledger", id]);
    const ready = cache.getQueryData<ReturnType<typeof readinessSchema.parse>>([
      "room-readiness",
      context.stay.roomId,
    ]);
    if (
      (record &&
        validVersion(record.version) &&
        record.version > context.stay.version) ||
      (balance && balance.reservation.version > context.stay.version) ||
      (ready && ready.version > context.ready.version)
    )
      throw new OperationRecoveryError(
        "A newer stay or room state is already loaded. Load the current stay again.",
      );
  };
  const review = useSave<void>(
    async () => {
      const requested = action();
      const context = await loadContext();
      if (context.stay.version !== draft.expectedVersion)
        throw new OperationRecoveryError(
          "The stay changed. Load the current stay before reviewing again.",
        );
      const day = context.balance.propertyDate,
        stay = context.stay;
      const allowed =
        kind === "CHECK_IN"
          ? stay.phase === "CONFIRMED" &&
            day >= stay.startDate &&
            day < stay.endDate
          : kind === "CHECK_OUT"
            ? stay.phase === "CHECKED_IN" && day === stay.endDate
            : kind === "CANCEL"
              ? stay.phase === "CONFIRMED"
              : kind === "NO_SHOW"
                ? stay.phase === "CONFIRMED" && day > stay.startDate
                : ["CHECKED_IN", "CHECKED_OUT"].includes(stay.phase);
      if (!allowed)
        throw new OperationRecoveryError(
          "This action is no longer available for the current stay and property day. Close the dialog and review the stay.",
        );
      if (kind === "CHECK_IN" && context.ready.state !== "CLEAN")
        throw new OperationRecoveryError(
          "This room must be clean before check-in. Complete its cleaning and inspection first.",
        );
      if (
        kind === "CHECK_OUT" &&
        (context.balance.outstandingCents !== 0 ||
          context.balance.creditCents !== 0) &&
        !fields.ack
      )
        throw new OperationRecoveryError(
          "Acknowledge the outstanding balance or credit before checkout. No money is recorded automatically.",
        );
      return { identity, context, action: requested };
    },
    (value) => {
      const result = value as NonNullable<typeof reviewed>;
      newest(result.context);
      if (result.identity === identity) setReviewed(result);
    },
    { invalidate: false, repeatable: true },
  );
  const save = useSave<boolean>(
    async (check) => {
      if (!online)
        throw new OperationRecoveryError(
          "Reconnect before checking or confirming a stay action.",
        );
      if (check) {
        try {
          return await booking.operateStay(
            id,
            action(),
            draft.expectedVersion,
            undefined,
            true,
          );
        } catch (error) {
          if (
            !(error instanceof PendingIntentMissingError) ||
            kind !== "CANCEL"
          )
            throw error;
          return booking.recoverCancellation(id);
        }
      }
      if (
        recoveryOnly ||
        reviewed?.identity !== identity ||
        draft.expectedVersion !== reservation.version
      )
        throw new OperationRecoveryError(
          "Review the current stay before confirming.",
        );
      return booking.operateStay(
        id,
        reviewed.action,
        draft.expectedVersion,
        kind === "CHECK_IN" ? reviewed.context.ready.version : undefined,
      );
    },
    () => {
      draft.clear();
      onSaved();
    },
  );
  const reload = useSave<void>(
    loadContext,
    (value) => {
      const context = value as Context;
      newest(context);
      cache.setQueryData(["reservations", id], context.stay);
      cache.setQueryData(["ledger", id], context.balance);
      cache.setQueryData(
        ["room-readiness", context.stay.roomId],
        context.ready,
      );
      draft.reload(fields, context.stay.version);
      setReviewed(undefined);
      save.resetStatus();
      review.resetStatus();
      setMessage("");
    },
    { invalidate: false, repeatable: true },
  );
  const resolve = useSave<void>(
    async () => {
      const arrival = timeOptionsSchema.parse(
        await apis.operationsApi.propertyTimeOptions({
          propertyTimeRequest: { localDateTime: fields.arrival },
        }),
      );
      const departure = fields.departure
        ? timeOptionsSchema.parse(
            await apis.operationsApi.propertyTimeOptions({
              propertyTimeRequest: { localDateTime: fields.departure },
            }),
          )
        : undefined;
      if (
        arrival.localDateTime !== fields.arrival ||
        departure?.localDateTime !== (fields.departure || undefined)
      )
        throw new OperationRecoveryError(
          "The property times changed. Resolve them again.",
        );
      return { arrival, departure };
    },
    (value) => {
      const result = value as NonNullable<typeof options>;
      setOptions(result);
      change({
        arrivalUtc:
          result.arrival.options.length === 1
            ? result.arrival.options[0].utc
            : "",
        departureUtc:
          result.departure?.options.length === 1
            ? result.departure.options[0].utc
            : "",
      });
    },
    { invalidate: false, repeatable: true },
  );
  const busy =
    review.isPending || reload.isPending || save.isPending || resolve.isPending;
  const stale = draft.expectedVersion !== reservation.version || save.stale;
  const shown = reviewed?.identity === identity ? reviewed : undefined;
  const submit = (check: boolean) => {
    setMessage("");
    void save.submit(check);
  };
  return (
    <Dialog
      title={recoveryOnly ? "Check previous stay action" : actionTitle(kind)}
      busy={busy}
      onClose={onClose}
    >
      <form
        aria-label={actionTitle(kind)}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void review.submit();
        }}
      >
        {recoveryOnly && (
          <SelectField
            label="Previous stay action"
            value={kind}
            disabled={busy}
            onChange={(event) =>
              onKind(event.target.value as StayAction["kind"])
            }
          >
            {(
              [
                "CHECK_IN",
                "CHECK_OUT",
                "NO_SHOW",
                "CANCEL",
                "CORRECT_STAY",
              ] as const
            ).map((value) => (
              <option key={value} value={value}>
                {actionTitle(value)}
              </option>
            ))}
          </SelectField>
        )}
        {kind === "CHECK_IN" && (
          <p>
            Record this guest's arrival now. The room must be clean and
            physically vacant. There is no readiness override.
          </p>
        )}
        {kind === "CHECK_OUT" && (
          <>
            <p>
              Record departure now and mark the current room dirty. Payments and
              refunds remain separate.
            </p>
            <p>
              Outstanding:{" "}
              {currentBalance?.outstandingCents == null
                ? "Unknown"
                : euros(currentBalance.outstandingCents)}{" "}
              · Credit:{" "}
              {currentBalance?.creditCents == null
                ? "Unknown"
                : euros(currentBalance.creditCents)}
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={fields.ack}
                disabled={busy}
                onChange={(event) => change({ ack: event.target.checked })}
              />
              I reviewed any outstanding balance or credit. Checkout records no
              payment or refund.
            </label>
          </>
        )}
        {["CANCEL", "NO_SHOW"].includes(kind) && (
          <p>
            This releases booked inventory and removes the accommodation amount
            owed. All agreements and payments remain in history. Money received
            stays as credit until a separate manual refund is recorded.
          </p>
        )}
        {kind === "CORRECT_STAY" && (
          <>
            <p>
              Correct actual times in Europe/Skopje. The booking, agreed price,
              status and room readiness remain unchanged. A repeated
              daylight-saving time requires an explicit offset.
            </p>
            <PropertyTimeFields
              label="Actual arrival"
              value={fields.arrival}
              disabled={busy}
              onChange={(value) => {
                change({ arrival: value, arrivalUtc: "" });
                setOptions(undefined);
              }}
            />
            <PropertyTimeFields
              label="Actual departure"
              value={fields.departure}
              disabled={
                busy || (!recoveryOnly && reservation.phase !== "CHECKED_OUT")
              }
              onChange={(value) => {
                change({ departure: value, departureUtc: "" });
                setOptions(undefined);
              }}
            />
            <button
              type="button"
              className="button secondary"
              disabled={busy || !online || !fields.arrival}
              onClick={() => void resolve.submit()}
            >
              Resolve property times
            </button>
            {options &&
              (["arrival", "departure"] as const).map((name) => {
                const value = options[name];
                if (!value) return null;
                if (value.options.length === 0)
                  return (
                    <Notice key={name} error>
                      This {name} time does not exist because the clocks move
                      forward. Choose a different local time.
                    </Notice>
                  );
                return (
                  <SelectField
                    key={name}
                    label={`${name === "arrival" ? "Arrival" : "Departure"} UTC offset`}
                    value={
                      name === "arrival"
                        ? fields.arrivalUtc
                        : fields.departureUtc
                    }
                    disabled={busy}
                    onChange={(event) =>
                      change(
                        name === "arrival"
                          ? { arrivalUtc: event.target.value }
                          : { departureUtc: event.target.value },
                      )
                    }
                  >
                    <option value="">Choose the recorded offset</option>
                    {value.options.map((option) => (
                      <option key={option.utc} value={option.utc}>
                        {option.offset} · {option.utc}
                      </option>
                    ))}
                  </SelectField>
                );
              })}
          </>
        )}
        {kind !== "CHECK_IN" && (
          <TextArea
            label={requiredReason ? "Reason" : "Reason, optional"}
            maxLength={500}
            value={fields.reason}
            disabled={busy}
            onChange={(event) => change({ reason: event.target.value })}
          />
        )}
        {shown && !recoveryOnly && (
          <section className="quote-review" aria-label="Reviewed stay action">
            <h3>Review {actionTitle(kind).toLowerCase()}</h3>
            <p>
              {phaseLabel(shown.context.stay.phase)} ·{" "}
              {dateLabel(shown.context.stay.startDate)} to{" "}
              {dateLabel(shown.context.stay.endDate)}
            </p>
            <p>Room readiness: {stateLabel(shown.context.ready.state)}</p>
            <p>
              Outstanding:{" "}
              {shown.context.balance.outstandingCents === null
                ? "Unknown"
                : euros(shown.context.balance.outstandingCents)}{" "}
              · Credit:{" "}
              {shown.context.balance.creditCents === null
                ? "Unknown"
                : euros(shown.context.balance.creditCents)}
            </p>
            {kind === "CORRECT_STAY" && (
              <p>
                Arrival {fields.arrivalUtc} · Departure{" "}
                {fields.departureUtc || "Not recorded"}
              </p>
            )}
          </section>
        )}
        {stale && !recoveryOnly && (
          <Notice error>
            The stay changed. Check any previous save, then load the current
            stay before a new confirmation.
          </Notice>
        )}
        {[
          message,
          review.message,
          reload.message,
          resolve.message,
          save.message,
        ]
          .filter(Boolean)
          .map((text, index) => (
            <Notice key={index} error>
              {text}
            </Notice>
          ))}
        <div className="dialog-actions">
          <button
            type="button"
            className="button quiet"
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
                Load current stay
              </button>
              <button
                className="button secondary"
                disabled={busy || !online || stale}
              >
                Review action
              </button>
              {shown && (
                <button
                  type="button"
                  className="button"
                  disabled={busy || !online || stale}
                  onClick={() => submit(false)}
                >
                  {save.isPending
                    ? "Confirming…"
                    : `Confirm ${kind === "CHECK_IN" ? "check-in" : kind === "CHECK_OUT" ? "checkout" : kind === "CANCEL" ? "cancellation" : kind === "NO_SHOW" ? "no-show" : "time correction"}`}
                </button>
              )}
            </>
          )}
        </div>
      </form>
    </Dialog>
  );
}
export function RoomAllocationsPanel({
  reservation,
}: {
  reservation: ReservationInfo;
}) {
  const { apis } = useWorkspace();
  const id = reservation.id!;
  const query = useInfiniteQuery({
    queryKey: ["room-allocations", id, reservation.version],
    initialPageParam: "0",
    queryFn: async ({ signal, pageParam }) => {
      const page = allocationsSchema.parse(
        await apis.operationsApi.reservationAllocations(
          {
            id,
            afterId: pageParam,
            expectedVersion: reservation.version,
            limit: 50,
          },
          { signal },
        ),
      );
      if (
        page.reservationId !== id ||
        page.reservationVersion !== reservation.version
      )
        throw new OperationRecoveryError(
          "The room allocations changed. Refresh the stay.",
        );
      return page;
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  return (
    <section className="panel" aria-label="Dated room assignments">
      <h2>Dated room assignments</h2>
      <p className="hint">
        Past nights retain their room after a move. The agreed price covers the
        whole stay.
      </p>
      {query.isPending ? (
        <Pending />
      ) : query.isError && !query.data ? (
        <QueryError retry={() => void query.refetch()} />
      ) : (
        <Table label="Room assignments" headings={["Room", "From", "Until"]}>
          {query.data?.pages
            .flatMap((page) => page.items)
            .map((row) => (
              <tr key={row.id}>
                <td>
                  <Link to={`/rooms/${row.roomId}`}>
                    {row.roomName} · {row.roomReference}
                  </Link>
                </td>
                <td>{dateLabel(row.startDate)}</td>
                <td>{dateLabel(row.endDate)}</td>
              </tr>
            ))}
        </Table>
      )}
      {query.isError && query.data && (
        <Notice error>
          More assignments could not be loaded. Refresh the stay.
        </Notice>
      )}
      {query.hasNextPage && (
        <button
          className="button secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more room assignments
        </button>
      )}
    </section>
  );
}
