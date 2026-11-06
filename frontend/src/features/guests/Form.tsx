import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import type { Customer } from "../../api/generated";
import { useWorkspace } from "../../app/context";
import { guestSchema } from "../../shared/schemas";
import { validVersion } from "../../shared/format";
import { useDraft } from "../../shared/useDraft";
import { useVersionedDraft } from "../../shared/useVersionedDraft";
import { useSave } from "../../shared/useSave";
import {
  Field,
  TextArea,
  MutationNotice,
  Notice,
  Pending,
  QueryError,
  RecordState,
} from "../../shared/ui";

export type GuestFields = z.infer<typeof guestSchema>;
const guestFields = (guest?: Customer): GuestFields => ({
  firstName: guest?.firstName ?? "",
  lastName: guest?.lastName ?? "",
  phone: guest?.phone ?? "",
  email: guest?.email ?? "",
  address: guest?.address ?? "",
  notes: guest?.notes ?? "",
});

function Fields({ form }: { form: UseFormReturn<GuestFields> }) {
  const errors = form.formState.errors;
  return (
    <>
      <div className="form-grid">
        <Field
          label="First name"
          autoComplete="off"
          maxLength={200}
          {...form.register("firstName")}
          error={errors.firstName?.message}
        />
        <Field
          label="Last name"
          autoComplete="off"
          maxLength={200}
          {...form.register("lastName")}
          error={errors.lastName?.message}
        />
        <Field
          label="Phone"
          type="tel"
          autoComplete="off"
          maxLength={200}
          {...form.register("phone")}
          error={errors.phone?.message}
          hint="Optional. Use an international prefix when known."
        />
        <Field
          label="Email"
          type="email"
          autoComplete="off"
          maxLength={254}
          {...form.register("email")}
          error={errors.email?.message}
          hint="Optional."
        />
        <Field
          label="Address"
          autoComplete="off"
          maxLength={500}
          {...form.register("address")}
          error={errors.address?.message}
          hint="Optional operational address."
        />
      </div>
      <TextArea
        label="Notes"
        rows={3}
        autoComplete="off"
        maxLength={2000}
        {...form.register("notes")}
        error={errors.notes?.message}
        hint="Optional arrival or access notes. Do not enter identity documents or card details."
      />
    </>
  );
}

export function GuestForm({
  onSaved,
  onExisting,
  onPending,
  draftKey = "guest-create",
}: {
  onSaved: (id: number, label: string) => void;
  onExisting?: (id: number, label: string) => void;
  onPending?: (busy: boolean) => void;
  draftKey?: string;
}) {
  const { apis } = useWorkspace();
  const draft = useDraft(draftKey, guestFields());
  const form = useForm<GuestFields>({
    defaultValues: draft.initial,
    resolver: zodResolver(guestSchema),
  });
  useEffect(
    () =>
      form.subscribe({
        formState: { values: true },
        callback: ({ values }) => draft.save(values),
      }),
    [form, draft],
  );
  const values = useWatch({ control: form.control }) as GuestFields;
  const [candidate, setCandidate] =
    useState<Pick<GuestFields, "firstName" | "lastName" | "phone" | "email">>();
  const [separateFor, setSeparateFor] = useState<string>();
  const { firstName, lastName, phone, email } = values;
  const identity = JSON.stringify([
    firstName?.trim(),
    lastName?.trim(),
    phone?.trim(),
    email?.trim(),
  ]);
  const matchesCurrent =
    !!candidate &&
    JSON.stringify([
      candidate.firstName,
      candidate.lastName,
      candidate.phone,
      candidate.email,
    ]) === identity;
  const separate = separateFor === identity && matchesCurrent;
  useEffect(() => {
    const timer = setTimeout(() => {
      const result = guestSchema.safeParse({
        ...guestFields(),
        firstName,
        lastName,
        phone,
        email,
      });
      setCandidate(
        result.success
          ? {
              firstName: result.data.firstName,
              lastName: result.data.lastName,
              phone: result.data.phone,
              email: result.data.email,
            }
          : undefined,
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [firstName, lastName, phone, email]);
  const matches = useQuery({
    queryKey: ["guests", "duplicates", candidate],
    queryFn: ({ signal }) =>
      apis.customerApi.customerDuplicates(
        { customerCreateRequest: candidate! },
        { signal },
      ),
    enabled: !!candidate,
  });
  const save = useSave<GuestFields>(
    async (input) => {
      const id = await apis.customerApi.createCustomer({
        customerCreateRequest: { ...input, allowDuplicate: separate },
      });
      if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647)
        throw new Error("Unconfirmed guest result");
      return { id, label: `${input.firstName} ${input.lastName}` };
    },
    (result) => {
      const saved = result as { id: number; label: string };
      draft.clear();
      onSaved(saved.id, saved.label);
    },
  );
  return (
    <form
      noValidate
      aria-label="Add guest"
      onSubmit={form.handleSubmit(async (input) => {
        onPending?.(true);
        try {
          await save.submit(input);
        } finally {
          onPending?.(false);
        }
      })}
    >
      <p className="hint">
        First and last names are required. Contact details are optional.
      </p>
      <Fields form={form} />
      {matchesCurrent && (
        <section
          className="duplicate-review"
          aria-label="Possible existing guests"
        >
          {matches.isFetching ? (
            <Pending label="Checking for existing guests…" />
          ) : matches.isError ? (
            <QueryError retry={() => void matches.refetch()} />
          ) : (
            !!matches.data?.length && (
              <>
                <h3>Review possible matches</h3>
                <p className="hint">
                  Names and contacts can be shared. Choose an existing profile
                  or keep people separate.
                </p>
                <ul className="record-list">
                  {matches.data.map((guest) => (
                    <li key={guest.id}>
                      <div>
                        <Link to={`/guests/${guest.id}`}>
                          {guest.firstName} {guest.lastName}
                        </Link>
                        <small>
                          {guest.phone || guest.email || "No contact details"}
                        </small>
                        <RecordState active={guest.active} />
                      </div>
                      {onExisting && guest.active !== false && (
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => {
                            draft.clear();
                            onExisting(
                              guest.id!,
                              `${guest.firstName} ${guest.lastName}`,
                            );
                          }}
                        >
                          Use guest
                          <span className="sr-only">
                            {" "}
                            {guest.firstName} {guest.lastName}
                          </span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )
          )}
        </section>
      )}
      {matchesCurrent && matches.isSuccess && !!matches.data?.length && (
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={separate}
            onChange={(event) =>
              setSeparateFor(event.target.checked ? identity : undefined)
            }
          />
          I reviewed the matches and need a separate guest record
        </label>
      )}
      <MutationNotice save={save} />
      {save.message && (
        <p className="hint">
          Search for this guest before creating another record.
        </p>
      )}
      <div className="dialog-actions">
        <button className="button" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save guest"}
        </button>
      </div>
    </form>
  );
}

export function GuestEditor({
  guest,
  onSaved,
  onPending,
}: {
  guest: Customer;
  onSaved: () => void;
  onPending: (busy: boolean) => void;
}) {
  const { apis } = useWorkspace();
  const draft = useVersionedDraft(
    `guest-edit-${guest.id}`,
    guestFields(guest),
    guest.version,
  );
  const form = useForm<GuestFields>({
    defaultValues: draft.initial,
    resolver: zodResolver(guestSchema),
  });
  useEffect(
    () =>
      form.subscribe({
        formState: { values: true },
        callback: ({ values }) => draft.save(values),
      }),
    [form, draft],
  );
  const save = useSave<GuestFields>(
    async (values) => {
      if (draft.changed || !validVersion(draft.expectedVersion))
        throw new Error("Reload and review this guest before editing.");
      const saved = await apis.customerApi.updateCustomer({
        customerId: guest.id!,
        guestUpdateRequest: {
          ...values,
          expectedVersion: draft.expectedVersion,
        },
      });
      if (
        !saved ||
        saved.id !== guest.id ||
        !validVersion(saved.version) ||
        typeof saved.firstName !== "string" ||
        typeof saved.lastName !== "string"
      )
        throw new Error("The guest result could not be confirmed.");
      return saved;
    },
    () => {
      draft.clear();
      onSaved();
    },
  );
  const cache = useQueryClient();
  const reload = useSave<void>(
    async () => {
      const latest = await apis.customerApi.getCustomer({
        customerId: guest.id!,
      });
      if (!latest || latest.id !== guest.id || !validVersion(latest.version))
        throw new Error("The latest guest profile could not be loaded.");
      return latest;
    },
    (result) => {
      const received = result as Customer;
      const known = cache.getQueryData<Customer>(["guests", guest.id]);
      const latest =
        known &&
        validVersion(known.version) &&
        known.version > received.version!
          ? known
          : received;
      const values = guestFields(latest);
      cache.setQueryData(["guests", guest.id], latest);
      draft.reload(values, latest.version);
      form.reset(values);
      save.resetStatus();
    },
    { invalidate: false },
  );
  return (
    <form
      noValidate
      aria-label="Edit guest"
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
      {(draft.changed || save.stale) && (
        <Notice error>
          The saved profile changed. Your entered details are retained. Load the
          latest profile before submitting again.
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
          Load latest profile
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
