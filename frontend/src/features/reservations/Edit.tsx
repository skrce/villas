import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { staySchema } from "../../shared/schemas";
import { dateLabel, roomChoiceLabel } from "../../shared/format";
import { useDraft } from "../../shared/useDraft";
import { Field, SelectField, Notice } from "../../shared/ui";
export function EditReservation({
  kind,
  draftKey,
  record,
  rooms,
  onSubmit,
  busy,
  blocked = false,
  message,
}: {
  kind: "move" | "stay" | "cancel";
  draftKey: string;
  record: {
    startDate: string;
    endDate: string;
    guestCount: number;
    roomId: number;
  };
  rooms: {
    id?: number | null;
    capacity?: number | null;
    view?: string | null;
    orientation?: string | null;
    active?: boolean;
  }[];
  onSubmit: (value: {
    room?: number;
    stay?: z.infer<typeof staySchema>;
  }) => Promise<void>;
  busy: boolean;
  blocked?: boolean;
  message: string;
}) {
  const draft = useDraft(draftKey, { ...record, room: "" });
  const [room, setRoom] = useState(draft.initial.room);
  const form = useForm<z.infer<typeof staySchema>>({
    defaultValues: draft.initial,
    resolver: zodResolver(staySchema),
  });
  useEffect(
    () =>
      form.subscribe({
        formState: { values: true },
        callback: ({ values }) => draft.save(values),
      }),
    [form, draft],
  );
  return (
    <form
      aria-label={
        kind === "cancel"
          ? "Cancel reservation"
          : kind === "move"
            ? "Move room"
            : "Edit stay"
      }
      noValidate
      onSubmit={
        kind === "stay"
          ? form.handleSubmit((stay) => onSubmit({ stay }))
          : async (event) => {
              event.preventDefault();
              if (kind !== "move" || room)
                await onSubmit({ room: Number(room) });
            }
      }
    >
      {kind === "cancel" ? (
        <p>
          This releases the room for {dateLabel(record.startDate)} to{" "}
          {dateLabel(record.endDate)}. The reservation and its history are
          retained. No payment or refund is initiated.
        </p>
      ) : kind === "move" ? (
        <SelectField
          label="New room"
          hint="Availability is checked again when you save."
          required
          value={room}
          onChange={(event) => {
            setRoom(event.target.value);
            draft.save({ ...form.getValues(), room: event.target.value });
          }}
        >
          <option value="">Choose a room</option>
          {rooms
            .filter(
              (item) =>
                item.id !== record.roomId &&
                item.active !== false &&
                (item.capacity ?? 0) >= record.guestCount,
            )
            .map((item) => (
              <option key={item.id} value={item.id!}>
                {roomChoiceLabel(item)}
              </option>
            ))}
        </SelectField>
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
      {message && <Notice error>{message}</Notice>}
      <div className="dialog-actions">
        <button
          className={`button ${kind === "cancel" ? "danger" : ""}`}
          disabled={busy || blocked || (kind === "move" && !room)}
        >
          {busy
            ? "Saving…"
            : kind === "cancel"
              ? "Confirm cancellation"
              : "Save changes"}
        </button>
      </div>
    </form>
  );
}
