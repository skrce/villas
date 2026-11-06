import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useWorkspace } from "../../app/context";
import { dateLabel, euros, validVersion } from "../../shared/format";
import { parseEuroCents } from "../../shared/money";
import { useVersionedDraft } from "../../shared/useVersionedDraft";
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
import {
  confirmedRates,
  matchesRateInput,
  type RateData,
  rateFields,
  rateSchema,
  type RateFields,
} from "./rateFields";

export function RoomRatesPanel({ roomId }: { roomId: number }) {
  const { apis } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["rates", roomId],
    queryFn: async ({ signal }) =>
      confirmedRates(
        await apis.ratesApi.roomRates({ apartmentId: roomId }, { signal }),
        roomId,
      ),
  });
  return (
    <section className="panel" id="rates">
      <div className="section-heading">
        <h2>Nightly rates</h2>
        {query.data && (
          <button className="button secondary" onClick={() => setEditing(true)}>
            {query.data.baseNightlyCents == null
              ? "Configure rates"
              : "Edit rates"}
          </button>
        )}
      </div>
      <p className="hint">
        Final accommodation prices in EUR per room, for any party within
        capacity. No extra fees or taxes are added by Villas.
      </p>
      {query.isPending ? (
        <Pending />
      ) : query.isError ? (
        <QueryError retry={() => void query.refetch()} />
      ) : query.data.baseNightlyCents == null ? (
        <Empty title="Rates need configuration">
          Set a base nightly price before quoting a stay. Old example prices are
          not used.
        </Empty>
      ) : (
        <>
          <p className="base-rate">
            <strong>{euros(query.data.baseNightlyCents)}</strong> per night{" "}
            <span className="hint">Base rate</span>
          </p>
          {!query.data.seasons?.length ? (
            <p className="hint">The base rate applies to every night.</p>
          ) : (
            <ul className="record-list">
              {query.data.seasons.map((rule) => (
                <li key={rule.startDate}>
                  <div>
                    <strong>{rule.name}</strong>
                    <p>
                      {dateLabel(rule.startDate)} → {dateLabel(rule.endDate)} ·
                      end date excluded
                    </p>
                  </div>
                  <strong>{euros(rule.nightlyCents)} / night</strong>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {editing && query.data && (
        <Dialog
          title="Edit nightly rates"
          busy={busy}
          onClose={() => setEditing(false)}
        >
          <RateEditor
            rates={query.data}
            onSaved={() => setEditing(false)}
            onPending={setBusy}
          />
        </Dialog>
      )}
    </section>
  );
}

function RateEditor({
  rates,
  onSaved,
  onPending,
}: {
  rates: RateData;
  onSaved: () => void;
  onPending: (value: boolean) => void;
}) {
  const { apis } = useWorkspace();
  const cache = useQueryClient();
  const draft = useVersionedDraft(
    `rates-edit-${rates.roomId}`,
    rateFields(rates),
    rates.version,
  );
  const form = useForm<RateFields>({
    defaultValues: draft.initial,
    resolver: zodResolver(rateSchema),
  });
  const seasons = useFieldArray({ control: form.control, name: "seasons" });
  useEffect(
    () =>
      form.subscribe({
        formState: { values: true },
        callback: ({ values }) => draft.save(values),
      }),
    [form, draft],
  );
  const save = useSave<RateFields>(
    async (values) => {
      if (draft.changed || !validVersion(draft.expectedVersion))
        throw new Error("Reload the rates before editing.");
      const result = confirmedRates(
        await apis.ratesApi.updateRoomRates({
          apartmentId: rates.roomId,
          rateUpdateRequest: {
            expectedVersion: draft.expectedVersion,
            currency: "EUR",
            baseNightlyCents: parseEuroCents(values.base)!,
            seasons: values.seasons.map((rule) => ({
              name: rule.name,
              startDate: rule.startDate,
              endDate: rule.endDate,
              nightlyCents: parseEuroCents(rule.price)!,
            })),
          },
        }),
        rates.roomId,
      );
      if (
        result.version !== draft.expectedVersion + 1 ||
        !matchesRateInput(result, values)
      )
        throw new Error("The saved room rates could not be confirmed.");
      return result;
    },
    () => {
      draft.clear();
      onSaved();
    },
  );
  const reload = useSave<void>(
    async () =>
      confirmedRates(
        await apis.ratesApi.roomRates({ apartmentId: rates.roomId }),
        rates.roomId,
      ),
    (result) => {
      const received = result as RateData;
      const known = cache.getQueryData<RateData>(["rates", rates.roomId]);
      const latest =
        known &&
        validVersion(known.version) &&
        known.version > received.version!
          ? known
          : received;
      const fields = rateFields(latest);
      cache.setQueryData(["rates", rates.roomId], latest);
      draft.reload(fields, latest.version);
      form.reset(fields);
      save.resetStatus();
    },
    { invalidate: false },
  );
  const busy = save.isPending || reload.isPending;
  const errors = form.formState.errors;
  const track = async (action: () => Promise<unknown>) => {
    onPending(true);
    try {
      await action();
    } finally {
      onPending(false);
    }
  };
  return (
    <form
      noValidate
      aria-label="Edit nightly rates"
      onSubmit={form.handleSubmit((values) => {
        if (draft.changed || save.stale || busy) return;
        return track(() => save.submit(values));
      })}
    >
      <Field
        label="Base price (EUR per night)"
        inputMode="decimal"
        autoComplete="off"
        maxLength={32}
        {...form.register("base")}
        error={errors.base?.message}
        hint="For example, 50.00 or 50,00. Prices include any accommodation charges you choose to collect."
      />
      <h3>Seasonal prices</h3>
      <p className="hint">
        Seasonal prices replace the base rate for their dates. End dates are
        excluded and periods cannot overlap.
      </p>
      <div className="season-list">
        {seasons.fields.map((row, index) => (
          <fieldset className="season-fields" key={row.id}>
            <legend>Season {index + 1}</legend>
            <div className="form-grid">
              <Field
                label="Season name"
                maxLength={100}
                autoComplete="off"
                {...form.register(`seasons.${index}.name`)}
                error={errors.seasons?.[index]?.name?.message}
              />
              <Field
                label="Nightly price (EUR)"
                inputMode="decimal"
                maxLength={32}
                autoComplete="off"
                {...form.register(`seasons.${index}.price`)}
                error={errors.seasons?.[index]?.price?.message}
              />
              <Field
                label="Season start"
                type="date"
                min="1000-01-01"
                max="9999-12-31"
                {...form.register(`seasons.${index}.startDate`)}
                error={errors.seasons?.[index]?.startDate?.message}
              />
              <Field
                label="Season end"
                type="date"
                min="1000-01-01"
                max="9999-12-31"
                {...form.register(`seasons.${index}.endDate`)}
                error={errors.seasons?.[index]?.endDate?.message}
              />
            </div>
            <button
              type="button"
              className="button quiet"
              disabled={busy}
              onClick={() => seasons.remove(index)}
            >
              Remove season {index + 1}
            </button>
          </fieldset>
        ))}
      </div>
      <button
        type="button"
        className="button secondary"
        disabled={busy || seasons.fields.length >= 200}
        onClick={() =>
          seasons.append({ name: "", startDate: "", endDate: "", price: "" })
        }
      >
        Add seasonal price
      </button>
      {(draft.changed || save.stale) && (
        <Notice error>
          The saved rates changed. Your entered prices are retained. Load the
          latest rates before submitting again.
        </Notice>
      )}
      {!save.stale && <MutationNotice save={save} />}
      <MutationNotice save={reload} />
      {save.message && !save.stale && (
        <p className="hint">
          Refresh the room rates and review the saved values before repeating an
          unconfirmed change.
        </p>
      )}
      <div className="dialog-actions">
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => void track(() => reload.submit())}
        >
          Load latest rates
        </button>
        <button
          className="button"
          disabled={busy || draft.changed || save.stale}
        >
          {save.isPending ? "Saving…" : "Save rates"}
        </button>
      </div>
    </form>
  );
}
