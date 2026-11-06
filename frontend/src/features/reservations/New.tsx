import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { useWorkspace } from "../../app/context";
import { bookingSchema, staySchema } from "../../shared/schemas";
import {
  propertyToday,
  roomChoiceLabel,
  euros,
  dateLabel,
} from "../../shared/format";
import { bookingSeed } from "./calendarData";
import { useDraft } from "../../shared/useDraft";
import { useOnline } from "../../shared/useOnline";
import { useSave } from "../../shared/useSave";
import { useRooms } from "../rooms/queries";
import { GuestForm } from "../guests/Form";
import { GuestPicker } from "../../shared/GuestPicker";
import { QuoteSummary } from "./PriceSummary";
import {
  confirmedQuote,
  refreshedQuote,
  stayIdentity,
  type QuoteData,
  type StayInput,
} from "../../shared/pricing";
import {
  Empty,
  Dialog,
  Field,
  SelectField,
  Notice,
  PageHead,
  Pending,
  QueryError,
  MutationNotice,
} from "../../shared/ui";
export function NewReservation() {
  const { apis, booking } = useWorkspace();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const seed = bookingSeed(params, propertyToday());
  const guestId = seed.guestId;
  type Values = z.infer<typeof bookingSchema>;
  const draft = useDraft<Values>(seed.key, {
    customerId: "",
    guestLabel: "",
    roomId: seed.roomId,
    startDate: seed.startDate,
    endDate: seed.endDate,
    guestCount: 1,
  });
  const viewDraft = useDraft<{ step: number; expanded: boolean }>(
    `${seed.key}-view`,
    { step: 1, expanded: false },
  );
  const [step, setStep] = useState(viewDraft.initial.step);
  const [expanded, setExpanded] = useState(viewDraft.initial.expanded);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const online = useOnline();
  const goStep = (next: number) => {
    stepHeading.current?.focus();
    setStep(next);
    viewDraft.save({ step: next, expanded });
  };
  useEffect(() => {
    stepHeading.current?.focus();
  }, [step]);
  const linkedGuestApplied = useRef(!!draft.initial.customerId);
  const [creatingGuest, setCreatingGuest] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);
  const form = useForm<Values>({
    defaultValues: draft.initial,
    resolver: zodResolver(bookingSchema),
  });
  useEffect(() => {
    return form.subscribe({
      formState: { values: true },
      callback: ({ values }) => draft.save(values),
    });
  }, [form, draft]);
  const values = useWatch({
    control: form.control,
    defaultValue: draft.initial,
  }) as Values;
  const valid = staySchema.safeParse(values).success;
  const guest = useQuery({
    queryKey: ["guests", guestId],
    queryFn: ({ signal }) =>
      apis.customerApi.getCustomer({ customerId: guestId }, { signal }),
    enabled:
      Number.isSafeInteger(guestId) &&
      guestId > 0 &&
      guestId <= 2147483647 &&
      !values.customerId,
  });
  useEffect(() => {
    if (
      guest.data &&
      !linkedGuestApplied.current &&
      !form.getValues("customerId")
    ) {
      linkedGuestApplied.current = true;
      form.setValue("customerId", String(guest.data.id));
      form.setValue(
        "guestLabel",
        `${guest.data.firstName} ${guest.data.lastName}`,
      );
    }
  }, [guest.data, form]);
  const rooms = useQuery({
    queryKey: [
      "availability",
      values.startDate,
      values.endDate,
      values.guestCount,
    ],
    queryFn: ({ signal }) =>
      apis.reservationApi.findAvailableApartments(
        {
          startDate: values.startDate,
          endDate: values.endDate,
          guestCount: values.guestCount,
        },
        { signal },
      ),
    enabled: valid && seed.valid,
    refetchOnWindowFocus: true,
    refetchOnReconnect: "always",
  });
  const inventory = useRooms();
  const [includeUnavailable, setIncludeUnavailable] = useState(false);
  const available = (rooms.data ?? []).filter((room) => room.active !== false);
  const choices = [
    ...(includeUnavailable ? (inventory.data ?? available) : available),
  ];
  if (
    values.roomId &&
    !choices.some((room) => room.id === Number(values.roomId))
  ) {
    choices.push(
      inventory.data?.find((room) => room.id === Number(values.roomId)) ?? {
        id: Number(values.roomId),
        view: "Previous room choice",
      },
    );
  }
  const inputFor = (value: Values): StayInput => ({
    customerId: Number(value.customerId),
    roomId: Number(value.roomId),
    startDate: value.startDate,
    endDate: value.endDate,
    guestCount: value.guestCount,
  });
  const [quote, setQuote] = useState<{
    value: QuoteData;
    identity: string;
    refreshed: boolean;
  }>();
  const visibleQuote =
    quote?.identity === stayIdentity(inputFor(values)) ? quote : undefined;
  const review = useSave<Values>(
    async (value) => {
      setQuote(undefined);
      const input = inputFor(value);
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
        identity: stayIdentity(input),
        refreshed: false,
      };
    },
    (result) => {
      const received = result as NonNullable<typeof quote>;
      if (received.identity === stayIdentity(inputFor(form.getValues()))) {
        setQuote(received);
        goStep(3);
      }
    },
    { invalidate: false, repeatable: true },
  );
  const mutation = useSave<Values>(
    async (value) => {
      const input = inputFor(value);
      if (!quote || quote.identity !== stayIdentity(input))
        throw new Error(
          "Review a price for these stay details before confirming.",
        );
      return booking.create({ ...input, quoteId: quote.value.id });
    },
    (result) => {
      draft.clear();
      viewDraft.clear();
      navigate(`/reservations/${result}`);
    },
    {
      onError: (body) => {
        const input = inputFor(form.getValues());
        const fresh = refreshedQuote(body, input);
        if (
          body &&
          typeof body === "object" &&
          "code" in body &&
          body.code === "INVENTORY_CONFLICT"
        ) {
          setQuote(undefined);
          goStep(2);
        }
        if (
          body &&
          typeof body === "object" &&
          "code" in body &&
          [
            "QUOTE_CHANGED",
            "QUOTE_MISMATCH",
            "QUOTE_ALREADY_ACCEPTED",
          ].includes(String(body.code))
        )
          setQuote(
            fresh
              ? { value: fresh, identity: stayIdentity(input), refreshed: true }
              : undefined,
          );
      },
    },
  );
  const recovery = useSave<Values>(
    (value) => booking.recoverCreate(inputFor(value)),
    (result) => {
      draft.clear();
      viewDraft.clear();
      navigate(`/reservations/${result}`);
    },
  );
  const saving = mutation.isPending || recovery.isPending;
  const busy = saving || review.isPending;
  const errors = form.formState.errors;
  const invalidStep = (errors: typeof form.formState.errors) =>
    goStep(errors.startDate || errors.endDate || errors.guestCount ? 1 : 2);
  const continueToChoices = () => {
    const parsed = staySchema.safeParse(form.getValues());
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        form.setError(issue.path[0] as keyof Values, {
          message: issue.message,
        });
      goStep(1);
    } else {
      form.clearErrors();
      goStep(2);
    }
  };
  const selectedRoom = choices.find(
    (room) => room.id === Number(values.roomId),
  );
  return (
    <>
      <Link className="back-link" to="/reservations">
        ← Reservations
      </Link>
      <PageHead title="New reservation">
        Dates, room and guest, then one reviewed confirmation.
      </PageHead>
      {!seed.valid && (
        <Notice error>
          This booking link has invalid dates or identifiers.{" "}
          <Link to="/reservations/new">Start a new reservation</Link> or return
          to the calendar.
        </Notice>
      )}
      <div className="booking-progress">
        <ol aria-label="Booking progress">
          {["Dates & party", "Room & guest", "Review & confirm"].map(
            (name, i) => (
              <li key={name} aria-current={step === i + 1 ? "step" : undefined}>
                <span>{i + 1}</span>
                {name}
              </li>
            ),
          )}
        </ol>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            const next = !expanded;
            setExpanded(next);
            viewDraft.save({ step, expanded: next });
          }}
        >
          {expanded ? "Use step-by-step form" : "Show all steps"}
        </button>
      </div>
      {!online && (
        <Notice>
          You're offline. Your draft is kept here. Reconnect, then explicitly
          review or check the previous save to continue.
        </Notice>
      )}
      <section className="panel form-panel booking-wizard">
        <form
          aria-label="New reservation"
          noValidate
          onSubmit={(event) => {
            if (!expanded && step === 1) {
              event.preventDefault();
              continueToChoices();
            } else void form.handleSubmit(review.submit, invalidStep)(event);
          }}
        >
          <h2 className="wizard-heading" ref={stepHeading} tabIndex={-1}>
            {step === 1
              ? "1. Stay details"
              : step === 2
                ? "2. Choose room & guest"
                : "3. Review & confirm"}
          </h2>
          <fieldset
            hidden={!expanded && step !== 1}
            className="stay-fields"
            disabled={saving || !seed.valid}
          >
            <legend className="sr-only">Dates and party size</legend>
            <div className="form-grid">
              <Field
                label="Check-in"
                type="date"
                min="1000-01-01"
                max="9999-12-31"
                {...form.register("startDate")}
                error={errors.startDate?.message}
              />
              <Field
                label="Check-out"
                type="date"
                min="1000-01-01"
                max="9999-12-31"
                {...form.register("endDate")}
                error={errors.endDate?.message}
              />
              <Field
                label="Guests"
                type="number"
                min={1}
                max={1000}
                {...form.register("guestCount", { valueAsNumber: true })}
                error={errors.guestCount?.message}
              />
            </div>
          </fieldset>
          <fieldset
            hidden={!expanded && step !== 2}
            className="stay-fields"
            disabled={saving || !seed.valid}
          >
            <legend className="sr-only">Room and guest</legend>
            <h3>Guest</h3>
            <GuestPicker
              value={values.customerId}
              label={values.guestLabel}
              onChange={(id, label) => {
                linkedGuestApplied.current = true;
                form.setValue("customerId", id, { shouldValidate: true });
                form.setValue("guestLabel", label);
              }}
              error={errors.customerId?.message}
            />
            {guest.isError && (
              <Notice error>
                The guest in this link could not be loaded. Search for a guest
                above.
              </Notice>
            )}
            <button
              className="button secondary inline-action"
              type="button"
              onClick={() => setCreatingGuest(true)}
            >
              Add guest
            </button>
            {guest.data?.active === false && (
              <Notice error>
                This guest is archived.{" "}
                <Link to={`/guests/${guest.data.id}`}>Open their profile</Link>{" "}
                to restore it before creating a new stay. You can still check an
                interrupted save with its original details.
              </Notice>
            )}
            <h3>Available rooms</h3>
            {!valid ? (
              <p className="hint">Enter valid stay dates to see rooms.</p>
            ) : (
              <>
                {rooms.isPaused ? (
                  <Notice>
                    Availability is waiting for a connection. Your room choice
                    is retained.
                  </Notice>
                ) : rooms.isPending ? (
                  <Pending label="Checking room availability…" />
                ) : rooms.isError ? (
                  <QueryError retry={() => void rooms.refetch()} />
                ) : (
                  !available.length && (
                    <Empty title="No rooms currently available">
                      Change the dates or check an interrupted save.
                    </Empty>
                  )
                )}
                {!rooms.isFetching &&
                  !rooms.isError &&
                  !rooms.isPaused &&
                  available.length > 0 && (
                    <div
                      className="room-choices"
                      aria-label="Available room choices"
                    >
                      {available.map((room) => (
                        <button
                          className="room-choice"
                          type="button"
                          key={room.id}
                          aria-pressed={values.roomId === String(room.id)}
                          onClick={() =>
                            form.setValue("roomId", String(room.id), {
                              shouldValidate: true,
                            })
                          }
                        >
                          <strong>
                            {room.name || room.view || `Room ${room.id}`}
                          </strong>
                          <span>
                            {room.reference} · up to {room.capacity} guests
                          </span>
                          <small>
                            {values.roomId === String(room.id)
                              ? "Selected"
                              : "Choose room"}
                          </small>
                        </button>
                      ))}
                    </div>
                  )}
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={includeUnavailable}
                    onChange={(event) =>
                      setIncludeUnavailable(event.target.checked)
                    }
                  />
                  Include unavailable rooms for an interrupted save
                </label>
                {includeUnavailable && inventory.isPending && (
                  <Pending label="Loading room inventory…" />
                )}
                {includeUnavailable && inventory.isError && (
                  <QueryError retry={() => void inventory.refetch()} />
                )}
                <SelectField
                  label="Room"
                  error={errors.roomId?.message}
                  hint="For an interrupted save, use the same details to check for an existing result. Availability is checked again when you save."
                  {...form.register("roomId")}
                >
                  <option value="">Choose a room</option>
                  {choices.map((room) => (
                    <option key={room.id} value={room.id!}>
                      {roomChoiceLabel(room)}
                      {room.capacity ? ` · up to ${room.capacity} guests` : ""}
                      {room.active === false
                        ? " (inactive)"
                        : rooms.data
                          ? !available.some((item) => item.id === room.id)
                            ? " (not currently available)"
                            : ""
                          : " (availability not confirmed)"}
                    </option>
                  ))}
                </SelectField>
                {rooms.isFetching && !rooms.isPending && (
                  <Pending label="Updating room availability…" />
                )}
              </>
            )}
          </fieldset>
          <section hidden={!expanded && step !== 3} aria-label="Booking review">
            <div className="booking-review-details">
              <h3>Your reservation</h3>
              <dl>
                <div>
                  <dt>Guest</dt>
                  <dd>{values.guestLabel || "Choose a guest"}</dd>
                </div>
                <div>
                  <dt>Room</dt>
                  <dd>
                    {selectedRoom
                      ? roomChoiceLabel(selectedRoom)
                      : "Choose a room"}
                  </dd>
                </div>
                <div>
                  <dt>Stay</dt>
                  <dd>
                    {dateLabel(values.startDate)} to {dateLabel(values.endDate)}
                  </dd>
                </div>
                <div>
                  <dt>Party</dt>
                  <dd>
                    {values.guestCount}{" "}
                    {values.guestCount === 1 ? "guest" : "guests"}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => goStep(1)}
              >
                Edit stay details
              </button>
              {" · "}
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => goStep(2)}
              >
                Change room or guest
              </button>
            </div>
            {visibleQuote ? (
              <QuoteSummary quote={visibleQuote.value} />
            ) : (
              <p className="hint">
                Review a current server quote before confirming these details.
              </p>
            )}
          </section>
          {visibleQuote?.refreshed && (
            <Notice>
              The quote was refreshed. Review the new total before confirming
              again.
            </Notice>
          )}
          <MutationNotice save={review} />
          {review.code === "RATES_REQUIRED" && values.roomId && (
            <p>
              <Link to={`/rooms/${values.roomId}#rates`}>
                Configure this room's rates
              </Link>
              , then return to review this stay.
            </p>
          )}
          <MutationNotice save={mutation} />
          {mutation.code === "INVENTORY_CONFLICT" && (
            <Notice>
              The selected room was taken or blocked. Your guest and stay
              details are retained. Choose a refreshed alternative or change
              dates, then review a new price.
            </Notice>
          )}
          <MutationNotice save={recovery} />
          <button
            type="button"
            className="button quiet"
            disabled={busy || !seed.valid || !online}
            onClick={() =>
              void form.handleSubmit(recovery.submit, invalidStep)()
            }
          >
            Check previous save
          </button>
          <p className="hint">
            Unsure whether a confirmation saved? Use the original guest, room,
            dates and party, then check. This finds the previous result without
            creating a booking. Show all steps to enter those details together.
          </p>
          <div className="form-actions">
            <Link className="button secondary" to="/reservations">
              Back to reservations
            </Link>
            {!expanded && step > 1 && (
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => goStep(step - 1)}
              >
                Previous step
              </button>
            )}
            {!expanded && step === 1 && (
              <button
                className="button"
                type="button"
                disabled={saving || !seed.valid}
                onClick={continueToChoices}
              >
                Continue to room & guest
              </button>
            )}
            {(expanded || step > 1) && (
              <button
                className={visibleQuote ? "button secondary" : "button"}
                disabled={busy || !seed.valid || !online}
              >
                {review.isPending
                  ? "Loading price…"
                  : visibleQuote
                    ? "Refresh quote"
                    : "Review price"}
              </button>
            )}
            {visibleQuote && (expanded || step === 3) && (
              <button
                type="button"
                className="button"
                disabled={busy || !seed.valid || !online}
                onClick={() => void form.handleSubmit(mutation.submit)()}
              >
                {mutation.isPending
                  ? "Confirming…"
                  : `Confirm reservation · ${euros(visibleQuote.value.price.totalCents)}`}
              </button>
            )}
          </div>
        </form>
      </section>
      {creatingGuest && (
        <Dialog
          title="Add guest"
          busy={guestBusy}
          onClose={() => setCreatingGuest(false)}
        >
          <GuestForm
            draftKey="inline-guest-create"
            onPending={setGuestBusy}
            onSaved={(id, label) => {
              linkedGuestApplied.current = true;
              form.setValue("customerId", String(id), { shouldValidate: true });
              form.setValue("guestLabel", label);
              setCreatingGuest(false);
            }}
            onExisting={(id, label) => {
              linkedGuestApplied.current = true;
              form.setValue("customerId", String(id), { shouldValidate: true });
              form.setValue("guestLabel", label);
              setCreatingGuest(false);
            }}
          />
        </Dialog>
      )}
    </>
  );
}
