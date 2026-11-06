import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import type { ReservationInfo } from "../../api/generated";
import { useWorkspace } from "../../app/context";
import { staySchema } from "../../shared/schemas";
import {
  dateLabel,
  euros,
  roomChoiceLabel,
  validVersion,
} from "../../shared/format";
import { useVersionedDraft } from "../../shared/useVersionedDraft";
import { useSave } from "../../shared/useSave";
import {
  confirmedQuote,
  refreshedQuote,
  stayIdentity,
  type QuoteData,
} from "../../shared/pricing";
import { Field, SelectField, Notice } from "../../shared/ui";
import { QuoteSummary } from "./PriceSummary";

type Stay = z.infer<typeof staySchema>;
type Record = Stay & { roomId: number };
type Props = {
  kind: "move" | "stay" | "cancel";
  reservationId: number;
  expectedVersion: number;
  currentVersion?: number;
  recoveryOnly?: boolean;
  draftKey: string;
  record: Record;
  rooms: {
    id?: number | null;
    capacity?: number | null;
    view?: string | null;
    orientation?: string | null;
    active?: boolean;
  }[];
  onSubmit: (value: { room?: number; stay?: Stay }) => Promise<void>;
  onSaved: () => void;
  onBusy: (busy: boolean) => void;
  busy: boolean;
  blocked?: boolean;
  message: string;
};
export function EditReservation(props: Props) {
  if (props.kind !== "cancel")
    return <PriceEdit {...props} kind={props.kind} />;
  return (
    <form
      aria-label="Cancel reservation"
      onSubmit={async (event) => {
        event.preventDefault();
        await props.onSubmit({});
      }}
    >
      <p>
        This releases the room for {dateLabel(props.record.startDate)} to{" "}
        {dateLabel(props.record.endDate)}. The reservation and its history are
        retained. No payment or refund is initiated.
      </p>
      {props.message && <Notice error>{props.message}</Notice>}
      <div className="dialog-actions">
        <button
          className="button danger"
          disabled={props.busy || props.blocked}
        >
          {props.busy ? "Saving…" : "Confirm cancellation"}
        </button>
      </div>
    </form>
  );
}
function PriceEdit({
  kind,
  reservationId,
  expectedVersion,
  currentVersion,
  recoveryOnly = false,
  draftKey,
  record,
  rooms,
  onSaved,
  onBusy,
}: Props & { kind: "move" | "stay" }) {
  const { apis, booking } = useWorkspace();
  const cache = useQueryClient();
  const draft = useVersionedDraft(
    draftKey,
    { ...record, room: "" },
    expectedVersion,
  );
  const [base, setBase] = useState(record);
  const [room, setRoom] = useState(draft.initial.room);
  const [includeUnavailable, setIncludeUnavailable] = useState(false);
  const form = useForm<Stay>({
    defaultValues: draft.initial,
    resolver: zodResolver(staySchema),
  });
  useEffect(
    () =>
      form.subscribe({
        formState: { values: true },
        callback: ({ values }) =>
          draft.save({ ...values, room, roomId: base.roomId }),
      }),
    [form, draft, room, base.roomId],
  );
  const values = form.watch();
  const inputFor = (stay: Stay = form.getValues()) => ({
    customerId: reservationId,
    roomId: kind === "move" ? Number(room) : base.roomId,
    startDate: kind === "move" ? base.startDate : stay.startDate,
    endDate: kind === "move" ? base.endDate : stay.endDate,
    guestCount: kind === "move" ? base.guestCount : stay.guestCount,
  });
  const changed =
    kind === "move"
      ? !!room && Number(room) !== base.roomId
      : values.startDate !== base.startDate ||
        values.endDate !== base.endDate ||
        values.guestCount !== base.guestCount;
  const [quote, setQuote] = useState<{
    value: QuoteData;
    identity: string;
    refreshed: boolean;
  }>();
  const identity = (stay: Stay = form.getValues()) =>
    `${draft.expectedVersion}:${stayIdentity(inputFor(stay))}`;
  const visible = quote?.identity === identity(values) ? quote : undefined;
  const staleDraft =
    !validVersion(currentVersion) || draft.expectedVersion !== currentVersion;
  const review = useSave<Stay>(
    async (stay) => {
      if (recoveryOnly || staleDraft || !changed)
        throw new Error(
          "Review the current reservation and changed stay details first.",
        );
      setQuote(undefined);
      const input = inputFor(stay);
      return {
        value: confirmedQuote(
          await apis.quotesApi.createBookingQuote({
            quoteRequest: {
              roomId: input.roomId,
              startDate: input.startDate,
              endDate: input.endDate,
              guestCount: input.guestCount,
            },
          }),
          input,
        ),
        identity: identity(stay),
        refreshed: false,
      };
    },
    (result) => {
      const offered = result as NonNullable<typeof quote>;
      if (offered.identity === identity()) setQuote(offered);
    },
    { invalidate: false, repeatable: true },
  );
  const saved = () => {
    draft.clear();
    onSaved();
  };
  const mutation = useSave<Stay>(
    async (stay) => {
      if (
        !visible ||
        visible.identity !== identity(stay) ||
        recoveryOnly ||
        staleDraft ||
        !changed
      )
        throw new Error(
          "Review the current booking and a new price before confirming.",
        );
      const target = inputFor(stay);
      return kind === "move"
        ? booking.move(
            reservationId,
            target.roomId,
            draft.expectedVersion,
            visible.value.id,
          )
        : booking.change(
            reservationId,
            target.startDate,
            target.endDate,
            target.guestCount,
            draft.expectedVersion,
            visible.value.id,
          );
    },
    saved,
    {
      onError: (body) => {
        if (
          body &&
          typeof body === "object" &&
          "code" in body &&
          [
            "QUOTE_CHANGED",
            "QUOTE_MISMATCH",
            "QUOTE_ALREADY_ACCEPTED",
          ].includes(String(body.code))
        ) {
          const fresh = refreshedQuote(body, inputFor());
          setQuote(
            fresh
              ? { value: fresh, identity: identity(), refreshed: true }
              : undefined,
          );
        }
      },
    },
  );
  const recovery = useSave<Stay>(
    (stay) =>
      kind === "move"
        ? booking.recoverMove(reservationId, Number(room))
        : booking.recoverChange(
            reservationId,
            stay.startDate,
            stay.endDate,
            stay.guestCount,
          ),
    saved,
  );
  const reload = useSave<void>(
    async () => {
      const latest = await apis.reservationApi.getReservation({
        reservationId,
      });
      const checked = staySchema.safeParse(latest);
      if (
        !checked.success ||
        latest.id !== reservationId ||
        !validVersion(latest.version) ||
        !Number.isSafeInteger(latest.roomId) ||
        latest.roomId! <= 0 ||
        latest.status !== "ACTIVE"
      )
        throw new Error("The current active reservation could not be loaded.");
      const next = { ...checked.data, roomId: latest.roomId! };
      return { latest, next, version: latest.version };
    },
    (result) => {
      const { latest, next, version } = result as {
        latest: ReservationInfo;
        next: Record;
        version: number;
      };
      const cached = cache.getQueryData<ReservationInfo>([
        "reservations",
        reservationId,
      ]);
      if (cached && validVersion(cached.version) && cached.version > version)
        throw new Error(
          "A newer reservation is already loaded. Load the latest stay again.",
        );
      cache.setQueryData(["reservations", reservationId], latest);
      setBase(next);
      setRoom("");
      form.reset(next);
      draft.reload({ ...next, room: "" }, version);
      setQuote(undefined);
      mutation.resetStatus();
      review.resetStatus();
      recovery.resetStatus();
    },
    { invalidate: false, repeatable: true },
  );
  const busy =
    mutation.isPending ||
    review.isPending ||
    recovery.isPending ||
    reload.isPending;
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
  const submit = (action: (stay: Stay) => Promise<void>) =>
    kind === "stay"
      ? form.handleSubmit(action)
      : async () => {
          if (room) await action(form.getValues());
        };
  return (
    <form
      aria-label={
        recoveryOnly
          ? kind === "move"
            ? "Check previous room save"
            : "Check previous stay save"
          : kind === "move"
            ? "Move room"
            : "Edit stay"
      }
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        await submit(recoveryOnly ? recovery.submit : review.submit)(event);
      }}
    >
      <fieldset className="form-fields" disabled={busy}>
        {kind === "move" ? (
          <>
            <SelectField
              label="New room"
              hint={
                recoveryOnly
                  ? "Choose the original requested room, including current or archived rooms."
                  : "Availability is checked again when you confirm."
              }
              required
              value={room}
              onChange={(event) => {
                setRoom(event.target.value);
                draft.save({
                  ...form.getValues(),
                  roomId: base.roomId,
                  room: event.target.value,
                });
              }}
            >
              <option value="">Choose a room</option>
              {rooms
                .filter(
                  (item) =>
                    recoveryOnly ||
                    includeUnavailable ||
                    item.id === Number(room) ||
                    (item.id !== base.roomId &&
                      item.active !== false &&
                      (item.capacity ?? 0) >= base.guestCount),
                )
                .map((item) => (
                  <option key={item.id} value={item.id!}>
                    {roomChoiceLabel(item)}
                    {item.active === false ? " (archived)" : ""}
                  </option>
                ))}
            </SelectField>
            {!recoveryOnly && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={includeUnavailable}
                  onChange={(event) =>
                    setIncludeUnavailable(event.target.checked)
                  }
                />
                Include other rooms for an interrupted save
              </label>
            )}
          </>
        ) : (
          <div className="form-grid">
            <Field
              type="date"
              label="Check-in"
              {...form.register("startDate")}
              error={form.formState.errors.startDate?.message}
            />
            <Field
              type="date"
              label="Check-out"
              {...form.register("endDate")}
              error={form.formState.errors.endDate?.message}
            />
            <Field
              type="number"
              min={1}
              max={1000}
              label="Guests"
              {...form.register("guestCount", { valueAsNumber: true })}
              error={form.formState.errors.guestCount?.message}
            />
          </div>
        )}
      </fieldset>
      {recoveryOnly ? (
        <Notice>
          This reservation is cancelled. Re-enter the original requested details
          to check a previous save. This check only reads a saved result.
        </Notice>
      ) : (
        <p className="hint">
          A change uses current rates for the whole stay. Previous agreed prices
          remain in history.
        </p>
      )}
      {!recoveryOnly && (staleDraft || mutation.stale) && (
        <Notice error>
          The saved reservation changed. Check any previous save, or load the
          latest stay before reviewing a new price.
        </Notice>
      )}
      {!recoveryOnly && (staleDraft || mutation.stale) && (
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => void reload.submit()}
        >
          Load latest stay
        </button>
      )}
      {!recoveryOnly && !changed && (
        <p className="hint">
          Choose a different room or change the stay details to review a new
          price.
        </p>
      )}
      {!recoveryOnly && review.code === "RATES_REQUIRED" && (
        <p>
          <Link to={`/rooms/${inputFor().roomId}#rates`}>
            Configure this room's rates
          </Link>
        </p>
      )}
      {!recoveryOnly && visible && <QuoteSummary quote={visible.value} />}
      {!recoveryOnly && visible?.refreshed && (
        <Notice>
          The quote was refreshed. Review the new total before confirming again.
        </Notice>
      )}
      {[review.message, mutation.message, recovery.message, reload.message]
        .filter(Boolean)
        .map((message, index) => (
          <Notice key={index} error>
            {message}
          </Notice>
        ))}
      <div className="dialog-actions">
        <button
          type="button"
          className="button quiet"
          disabled={busy || (kind === "move" && !room)}
          onClick={() => void submit(recovery.submit)()}
        >
          Check previous save
        </button>
        {!recoveryOnly && (
          <button
            className="button secondary"
            disabled={busy || staleDraft || mutation.stale || !changed}
          >
            {review.isPending
              ? "Loading price…"
              : visible
                ? "Refresh quote"
                : "Review price"}
          </button>
        )}
        {!recoveryOnly && visible && (
          <button
            type="button"
            className="button"
            disabled={busy || staleDraft || mutation.stale || !changed}
            onClick={() => void submit(mutation.submit)()}
          >
            {mutation.isPending
              ? "Saving…"
              : `Confirm changes · ${euros(visible.value.price.totalCents)}`}
          </button>
        )}
      </div>
    </form>
  );
}
