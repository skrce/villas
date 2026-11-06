import { useEffect } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import type { MaintenanceBlock } from "../../api/generated";
import { useWorkspace } from "../../app/context";
import { maintenanceSchema } from "../../shared/schemas";
import { dateLabel, eventLabel, validVersion } from "../../shared/format";
import { useDraft } from "../../shared/useDraft";
import { useSave } from "../../shared/useSave";
import {
  Dialog,
  Empty,
  Field,
  MutationNotice,
  Notice,
  Pending,
  QueryError,
} from "../../shared/ui";

type Values = z.infer<typeof maintenanceSchema>;
export function MaintenanceForm({
  roomId,
  from,
  to,
  recoveryOnly = false,
  onSaved,
  onPending,
}: {
  roomId: number;
  from: string;
  to: string;
  recoveryOnly?: boolean;
  onSaved: (id: number, from: string, to: string) => void;
  onPending: (busy: boolean) => void;
}) {
  const { booking } = useWorkspace();
  const draft = useDraft<Values>(`maintenance-create-${roomId}`, {
    startDate: from,
    endDate: to,
    reason: "Maintenance",
  });
  const form = useForm<Values>({
    defaultValues: draft.initial,
    resolver: zodResolver(maintenanceSchema),
  });
  useEffect(
    () =>
      form.subscribe({
        formState: { values: true },
        callback: ({ values }) => draft.save(values),
      }),
    [form, draft],
  );
  const save = useSave<Values>(
    async (values) => ({
      id: await booking.block(
        roomId,
        values.startDate,
        values.endDate,
        values.reason,
        { recoveryOnly },
      ),
      from: values.startDate,
      to: values.endDate,
    }),
    (result) => {
      const saved = result as { id: number; from: string; to: string };
      draft.clear();
      onSaved(saved.id, saved.from, saved.to);
    },
  );
  const errors = form.formState.errors;
  return (
    <form
      noValidate
      aria-label={
        recoveryOnly
          ? "Check interrupted maintenance save"
          : "Block for maintenance"
      }
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
        {recoveryOnly
          ? "Re-enter the original dates and reason to check an interrupted save. This room is archived, so this check cannot create new maintenance."
          : "This blocks the room from the start date up to the end date in Skopje property time. Existing stays are protected."}
      </p>
      <div className="form-grid">
        <Field
          label="Start date"
          type="date"
          min="1000-01-01"
          max="9999-12-31"
          {...form.register("startDate")}
          error={errors.startDate?.message}
        />
        <Field
          label="End date"
          type="date"
          min="1000-01-01"
          max="9999-12-31"
          {...form.register("endDate")}
          error={errors.endDate?.message}
        />
        <Field
          label="Reason"
          autoComplete="off"
          maxLength={200}
          {...form.register("reason")}
          error={errors.reason?.message}
        />
      </div>
      <MutationNotice save={save} />
      <div className="dialog-actions">
        <button className="button" disabled={save.isPending}>
          {save.isPending
            ? recoveryOnly
              ? "Checking…"
              : "Saving…"
            : recoveryOnly
              ? "Check saved result"
              : "Save maintenance"}
        </button>
      </div>
    </form>
  );
}
export function CancelMaintenance({
  block,
  onClose,
}: {
  block: MaintenanceBlock;
  onClose: () => void;
}) {
  const { booking } = useWorkspace();
  const version = block.version;
  const save = useSave<void>(async () => {
    if (!block.id || !validVersion(version))
      throw new Error("Reload this maintenance record before cancelling it.");
    return booking.unblock(block.id, version);
  }, onClose);
  return (
    <Dialog title="Cancel maintenance?" busy={save.isPending} onClose={onClose}>
      <p>
        <strong>{block.reason}</strong>
      </p>
      <p>
        {dateLabel(block.startDate)} → {dateLabel(block.endDate)}
      </p>
      <p>
        The room will be released for these dates. The cancelled block and its
        history will be retained.
      </p>
      {!validVersion(version) && (
        <Notice error>Reload the record before cancelling it.</Notice>
      )}
      <MutationNotice save={save} />
      <div className="dialog-actions">
        <button
          className="button secondary"
          disabled={save.isPending}
          onClick={onClose}
        >
          Keep block
        </button>
        <button
          className="button danger"
          disabled={save.isPending || save.stale || !validVersion(version)}
          onClick={() => void save.submit()}
        >
          {save.isPending ? "Saving…" : "Confirm maintenance cancellation"}
        </button>
      </div>
    </Dialog>
  );
}
export function MaintenanceHistory({
  block,
  onClose,
}: {
  block: MaintenanceBlock;
  onClose: () => void;
}) {
  const { apis } = useWorkspace();
  const query = useInfiniteQuery({
    queryKey: ["maintenance", "events", block.id],
    initialPageParam: "0",
    queryFn: ({ pageParam, signal }) =>
      apis.inventoryApi.maintenanceHistory(
        { blockId: block.id!, afterId: pageParam, limit: 30 },
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  return (
    <Dialog title="Maintenance history" onClose={onClose}>
      <p>{block.reason}</p>
      {query.isPending ? (
        <Pending />
      ) : query.isError ? (
        <QueryError retry={() => void query.refetch()} />
      ) : !query.data.pages.some((page) => page.items.length) ? (
        <Empty title="No events recorded" />
      ) : (
        <ol className="timeline">
          {query.data.pages
            .flatMap((page) => page.items)
            .map((event) => (
              <li key={event.id}>
                <strong>
                  {event.kind === "BLOCKED"
                    ? "Room blocked"
                    : event.kind === "UNBLOCKED"
                      ? "Block cancelled"
                      : event.kind}
                </strong>
                <p>
                  {dateLabel(event.startDate)} → {dateLabel(event.endDate)}
                </p>
                <small>{eventLabel(event.occurredAt)}</small>
              </li>
            ))}
        </ol>
      )}
      {query.hasNextPage && (
        <button
          className="button secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more events
        </button>
      )}
    </Dialog>
  );
}
