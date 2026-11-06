import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import type { Apartment } from "../../api/generated";
import { useWorkspace } from "../../app/context";
import { roomSchema } from "../../shared/schemas";
import { roomLabel, validVersion } from "../../shared/format";
import { useDraft } from "../../shared/useDraft";
import { useVersionedDraft } from "../../shared/useVersionedDraft";
import { useSave } from "../../shared/useSave";
import { Field, MutationNotice, Notice } from "../../shared/ui";

type RoomFields = z.infer<typeof roomSchema>;
const fields = (room?: Apartment): RoomFields => ({
  name: room ? roomLabel(room) : "",
  reference: room?.reference ?? "",
  capacity: room?.capacity ?? (room ? NaN : 2),
  orientation: room?.orientation ?? "",
  view: room?.view ?? "",
  bedConfiguration: room?.bedConfiguration ?? "",
  features: room?.features ?? "",
  floor: room?.floor ?? "",
});
function Fields({ form }: { form: UseFormReturn<RoomFields> }) {
  const errors = form.formState.errors;
  return (
    <div className="form-grid">
      <Field
        label="Room name"
        autoComplete="off"
        maxLength={200}
        {...form.register("name")}
        error={errors.name?.message}
      />
      <Field
        label="Reference"
        autoComplete="off"
        maxLength={32}
        {...form.register("reference")}
        error={errors.reference?.message}
        hint="Unique room code, such as GARDEN-1."
      />
      <Field
        label="Capacity"
        type="number"
        min={1}
        max={1000}
        step={1}
        {...form.register("capacity", { valueAsNumber: true })}
        error={errors.capacity?.message}
        hint="Maximum number of guests."
      />
      <Field
        label="Beds"
        autoComplete="off"
        maxLength={200}
        {...form.register("bedConfiguration")}
        error={errors.bedConfiguration?.message}
        hint="Optional, such as queen bed and sofa bed."
      />
      <Field
        label="Orientation"
        autoComplete="off"
        maxLength={200}
        {...form.register("orientation")}
        error={errors.orientation?.message}
      />
      <Field
        label="View"
        autoComplete="off"
        maxLength={200}
        {...form.register("view")}
        error={errors.view?.message}
      />
      <Field
        label="Floor"
        autoComplete="off"
        maxLength={50}
        {...form.register("floor")}
        error={errors.floor?.message}
      />
      <Field
        label="Amenities"
        autoComplete="off"
        maxLength={1000}
        {...form.register("features")}
        error={errors.features?.message}
        hint="Optional, such as Wi-Fi, terrace, step-free entrance."
      />
    </div>
  );
}
function confirmed(room: Apartment | null | undefined, id?: number) {
  if (
    !room ||
    !Number.isSafeInteger(room.id) ||
    !room.id ||
    room.id < 1 ||
    room.id > 2147483647 ||
    (id !== undefined && room.id !== id) ||
    !validVersion(room.version) ||
    typeof room.name !== "string" ||
    typeof room.reference !== "string"
  )
    throw new Error("The room result could not be confirmed.");
  return room.id;
}
export function RoomForm({
  onSaved,
  onPending,
}: {
  onSaved: (id: number) => void;
  onPending: (busy: boolean) => void;
}) {
  const { apis } = useWorkspace();
  const draft = useDraft("room-create", fields());
  const form = useForm<RoomFields>({
    defaultValues: draft.initial,
    resolver: zodResolver(roomSchema),
  });
  useEffect(
    () =>
      form.subscribe({
        formState: { values: true },
        callback: ({ values }) => draft.save(values),
      }),
    [form, draft],
  );
  const save = useSave<RoomFields>(
    async (values) =>
      confirmed(
        await apis.apartmentApi.createApartment({ roomCreateRequest: values }),
      ),
    (id) => {
      draft.clear();
      onSaved(id as number);
    },
  );
  return (
    <form
      noValidate
      aria-label="Add room"
      onSubmit={form.handleSubmit(async (values) => {
        onPending(true);
        try {
          await save.submit(values);
        } finally {
          onPending(false);
        }
      })}
    >
      <p className="hint">
        A name, unique reference and whole-number capacity are required.
      </p>
      <Fields form={form} />
      <MutationNotice save={save} />
      {save.message && (
        <p className="hint">
          Search this room reference before creating another record.
        </p>
      )}
      <div className="dialog-actions">
        <button className="button" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save room"}
        </button>
      </div>
    </form>
  );
}
export function RoomEditor({
  room,
  onSaved,
  onPending,
}: {
  room: Apartment;
  onSaved: () => void;
  onPending: (busy: boolean) => void;
}) {
  const { apis } = useWorkspace();
  const draft = useVersionedDraft(
    `room-edit-${room.id}`,
    fields(room),
    room.version,
  );
  const form = useForm<RoomFields>({
    defaultValues: draft.initial,
    resolver: zodResolver(roomSchema),
  });
  useEffect(
    () =>
      form.subscribe({
        formState: { values: true },
        callback: ({ values }) => draft.save(values),
      }),
    [form, draft],
  );
  const save = useSave<RoomFields>(
    async (values) => {
      if (draft.changed || !validVersion(draft.expectedVersion))
        throw new Error("Reload and review this room before editing.");
      return confirmed(
        await apis.apartmentApi.updateApartment({
          apartmentId: room.id!,
          roomUpdateRequest: {
            details: values,
            expectedVersion: draft.expectedVersion,
          },
        }),
        room.id!,
      );
    },
    () => {
      draft.clear();
      onSaved();
    },
  );
  const cache = useQueryClient();
  const reload = useSave<void>(
    async () => {
      const latest = await apis.apartmentApi.getApartment({
        apartmentId: room.id!,
      });
      confirmed(latest, room.id!);
      return latest;
    },
    (result) => {
      const received = result as Apartment;
      const known = cache.getQueryData<Apartment>(["rooms", room.id]);
      const latest =
        known &&
        validVersion(known.version) &&
        known.version > received.version!
          ? known
          : received;
      const values = fields(latest);
      cache.setQueryData(["rooms", room.id], latest);
      draft.reload(values, latest.version);
      form.reset(values);
      save.resetStatus();
    },
    { invalidate: false },
  );
  return (
    <form
      noValidate
      aria-label="Edit room"
      onSubmit={form.handleSubmit(async (values) => {
        if (draft.changed || save.stale || reload.isPending) return;
        onPending(true);
        try {
          await save.submit(values);
        } finally {
          onPending(false);
        }
      })}
    >
      <Fields form={form} />
      <p className="hint">
        Capacity changes must keep every current and future stay valid.
      </p>
      {(draft.changed || save.stale) && (
        <Notice error>
          The saved room changed. Your entered details are retained. Load the
          latest room before submitting again.
        </Notice>
      )}
      {!save.stale && <MutationNotice save={save} />}
      <MutationNotice save={reload} />
      <div className="dialog-actions">
        <button
          type="button"
          className="button secondary"
          disabled={save.isPending || reload.isPending}
          onClick={async () => {
            onPending(true);
            try {
              await reload.submit();
            } finally {
              onPending(false);
            }
          }}
        >
          Load latest room
        </button>
        <button
          className="button"
          disabled={
            save.isPending || reload.isPending || draft.changed || save.stale
          }
        >
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
