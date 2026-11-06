import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { useWorkspace } from "../../app/context";
import { bookingSchema, staySchema } from "../../shared/schemas";
import { addDays, propertyToday, roomChoiceLabel } from "../../shared/format";
import { useDraft } from "../../shared/useDraft";
import { useSave } from "../../shared/useSave";
import { useRooms } from "../rooms/queries";
import { GuestForm } from "../guests/Form";
import { GuestPicker } from "../../shared/GuestPicker";
import {
  Empty,
  Dialog,
  Field,
  SelectField,
  Notice,
  PageHead,
  Pending,
  QueryError,
} from "../../shared/ui";
export function NewReservation() {
  const { apis, booking } = useWorkspace();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const guestId = Number(params.get("guest"));
  const today = propertyToday();
  type Values = z.infer<typeof bookingSchema>;
  const draft = useDraft<Values>(
    Number.isSafeInteger(guestId) && guestId > 0 && guestId <= 2147483647
      ? `reservation-create-guest-${guestId}`
      : "reservation-create",
    {
      customerId: "",
      guestLabel: "",
      roomId: "",
      startDate: today,
      endDate: addDays(today, 1),
      guestCount: 1,
    },
  );
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
    enabled: valid,
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
  const mutation = useSave<Values>(
    (value) =>
      booking.create({
        customerId: Number(value.customerId),
        roomId: Number(value.roomId),
        startDate: value.startDate,
        endDate: value.endDate,
        guestCount: value.guestCount,
      }),
    (result) => {
      draft.clear();
      navigate(`/reservations/${result}`);
    },
  );
  const errors = form.formState.errors;
  return (
    <>
      <Link className="back-link" to="/reservations">
        ← Reservations
      </Link>
      <PageHead title="New reservation">
        Choose a guest, dates and an available room.
      </PageHead>
      <section className="panel form-panel">
        <form
          aria-label="New reservation"
          noValidate
          onSubmit={form.handleSubmit(mutation.submit)}
        >
          <h2>Stay details</h2>
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
          <hr />
          <h2>Guest & room</h2>
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
              <Link to={`/guests/${guest.data.id}`}>Open their profile</Link> to
              restore it before creating a new stay. You can still check an
              interrupted save with its original details.
            </Notice>
          )}
          {!valid ? (
            <p className="hint">Enter valid stay dates to see rooms.</p>
          ) : (
            <>
              {rooms.isPending ? (
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
          {mutation.message && <Notice error>{mutation.message}</Notice>}
          <div className="form-actions">
            <Link className="button secondary" to="/reservations">
              Back to reservations
            </Link>
            <button className="button" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Create reservation"}
            </button>
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
