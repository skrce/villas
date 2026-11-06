import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { useWorkspace } from "../../app/context";
import { bookingSchema, staySchema } from "../../shared/schemas";
import { addDays, propertyToday, roomLabel } from "../../shared/format";
import { useDraft } from "../../shared/useDraft";
import { useSave } from "../../shared/useSave";
import { GuestPicker } from "../../shared/GuestPicker";
import {
  Empty,
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
  const draft = useDraft<Values>("reservation-create", {
    customerId: "",
    guestLabel: "",
    roomId: "",
    startDate: today,
    endDate: addDays(today, 1),
    guestCount: 1,
  });
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
    if (guest.data && !form.getValues("customerId")) {
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
          onSubmit={form.handleSubmit(async (value) => {
            if (!rooms.data?.some((room) => room.id === Number(value.roomId))) {
              form.setError("roomId", {
                message: "Choose an available room for these dates.",
              });
              return;
            }
            await mutation.submit(value);
          })}
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
          <p className="hint">
            Need a new guest? <Link to="/guests">Add them from Guests</Link>,
            then return to this form.
          </p>
          {!valid ? (
            <p className="hint">Enter valid stay dates to see rooms.</p>
          ) : rooms.isPending ? (
            <Pending label="Checking room availability…" />
          ) : rooms.isError ? (
            <QueryError retry={() => void rooms.refetch()} />
          ) : !rooms.data.length ? (
            <Empty title="No rooms available">
              Try another period or fewer guests.
            </Empty>
          ) : (
            <SelectField
              label="Available room"
              error={errors.roomId?.message}
              {...form.register("roomId")}
            >
              <option value="">Choose a room</option>
              {rooms.data
                .filter((room) => room.active !== false)
                .map((room) => (
                  <option key={room.id} value={room.id!}>
                    {roomLabel(room)} · up to {room.capacity} guests
                  </option>
                ))}
            </SelectField>
          )}
          {rooms.isFetching && !rooms.isPending && (
            <Pending label="Updating room availability…" />
          )}
          {mutation.message && <Notice error>{mutation.message}</Notice>}
          <div className="form-actions">
            <Link className="button secondary" to="/reservations">
              Back to reservations
            </Link>
            <button
              className="button"
              disabled={mutation.isPending || rooms.isFetching}
            >
              {mutation.isPending ? "Saving…" : "Create reservation"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
