import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useWorkspace } from "../../app/context";
import { guestSchema, guestSearchSchema } from "../../shared/schemas";
import { useDraft } from "../../shared/useDraft";
import { useSave } from "../../shared/useSave";
import {
  Dialog,
  Empty,
  Field,
  Notice,
  PageHead,
  Pending,
  QueryError,
  Table,
} from "../../shared/ui";

type GuestFields = z.infer<typeof guestSchema>;
type SearchFields = z.infer<typeof guestSearchSchema>;
export function Guests() {
  const { apis } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<number>();
  const draft = useDraft("guest-search", { firstName: "", phone: "" });
  const form = useForm<SearchFields>({
    defaultValues: draft.initial,
    resolver: zodResolver(guestSearchSchema),
  });
  useEffect(() => {
    return form.subscribe({
      formState: { values: true },
      callback: ({ values }) => draft.save(values),
    });
  }, [form, draft]);
  const [criteria, setCriteria] = useState<SearchFields>();
  const query = useQuery({
    queryKey: ["guests", "search", criteria],
    queryFn: ({ signal }) =>
      apis.customerApi.searchCustomer(
        { customerSearchRequest: criteria! },
        { signal },
      ),
    enabled: !!criteria,
  });
  return (
    <>
      <PageHead
        title="Guests"
        actions={
          <button className="button" onClick={() => setCreating(true)}>
            Add guest
          </button>
        }
      >
        Find a guest and view their current reservations.
      </PageHead>
      {created && (
        <Notice>
          Guest saved. <Link to={`/guests/${created}`}>View guest details</Link>
        </Notice>
      )}
      <section className="panel">
        <h2>Find a guest</h2>
        <form
          className="form-row"
          aria-label="Search guests"
          noValidate
          onSubmit={form.handleSubmit((values) => {
            if (
              criteria?.firstName === values.firstName &&
              criteria?.phone === values.phone
            )
              void query.refetch();
            else setCriteria(values);
          })}
        >
          <Field
            label="First name"
            autoComplete="off"
            {...form.register("firstName")}
            error={form.formState.errors.firstName?.message}
          />
          <Field
            label="Phone"
            type="tel"
            autoComplete="off"
            {...form.register("phone")}
            error={form.formState.errors.phone?.message}
          />
          <button className="button secondary" disabled={query.isFetching}>
            Search guests
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Search results</h2>
          {query.data && (
            <span className="count">{query.data.length} guests</span>
          )}
        </div>
        {!criteria ? (
          <Empty title="Find your guest">
            Search by first name or phone number. Guest contacts stay out of the
            address bar.
          </Empty>
        ) : query.isPending ? (
          <Pending />
        ) : query.isError ? (
          <QueryError retry={() => void query.refetch()} />
        ) : !query.data.length ? (
          <Empty title="No matching guests">
            Try another name or phone, or add a new guest.
          </Empty>
        ) : (
          <>
            <Table
              label="Guest search results"
              headings={["Guest", "Phone", "Address", ""]}
            >
              {query.data.map((guest) => (
                <tr key={guest.id}>
                  <td>
                    <strong>
                      {guest.firstName} {guest.lastName}
                    </strong>
                  </td>
                  <td>{guest.phone}</td>
                  <td>{guest.address}</td>
                  <td>
                    <Link className="text-link" to={`/guests/${guest.id}`}>
                      View guest
                      <span className="sr-only">
                        {" "}
                        {guest.firstName} {guest.lastName}
                      </span>
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
            {query.data.length >= 50 && (
              <p className="hint">
                Showing the first 50 matches. Refine your search to find another
                guest.
              </p>
            )}
          </>
        )}
      </section>
      {creating && (
        <Dialog
          title="Add guest"
          busy={busy}
          onClose={() => setCreating(false)}
        >
          <GuestForm
            onPending={setBusy}
            onSaved={(id) => {
              setCreated(id);
              setCreating(false);
            }}
          />
        </Dialog>
      )}
    </>
  );
}
function GuestForm({
  onSaved,
  onPending,
}: {
  onSaved: (id: number) => void;
  onPending: (busy: boolean) => void;
}) {
  const { apis } = useWorkspace();
  const draft = useDraft<GuestFields>("guest-create", {
    firstName: "",
    lastName: "",
    phone: "",
    address: "",
  });
  const form = useForm<GuestFields>({
    defaultValues: draft.initial,
    resolver: zodResolver(guestSchema),
  });
  useEffect(() => {
    return form.subscribe({
      formState: { values: true },
      callback: ({ values }) => draft.save(values),
    });
  }, [form, draft]);
  const mutation = useSave<GuestFields>(
    async (values) => {
      const id = await apis.customerApi.createCustomer({
        customerCreateRequest: values,
      });
      if (!Number.isSafeInteger(id) || id < 1)
        throw new Error("Unconfirmed guest result");
      return id;
    },
    (result) => {
      draft.clear();
      onSaved(result as number);
    },
  );
  return (
    <form
      noValidate
      aria-label="Add guest"
      onSubmit={form.handleSubmit(async (values) => {
        onPending(true);
        try {
          await mutation.submit(values);
        } finally {
          onPending(false);
        }
      })}
    >
      <p className="hint">
        All four fields are required for the current guest record.
      </p>
      <div className="form-grid">
        <Field
          label="First name"
          autoComplete="off"
          maxLength={200}
          {...form.register("firstName")}
          error={form.formState.errors.firstName?.message}
        />
        <Field
          label="Last name"
          autoComplete="off"
          maxLength={200}
          {...form.register("lastName")}
          error={form.formState.errors.lastName?.message}
        />
        <Field
          label="Phone"
          type="tel"
          autoComplete="off"
          maxLength={200}
          {...form.register("phone")}
          error={form.formState.errors.phone?.message}
        />
        <Field
          label="Address"
          autoComplete="off"
          maxLength={200}
          {...form.register("address")}
          error={form.formState.errors.address?.message}
        />
      </div>
      {mutation.message && (
        <Notice error>
          {mutation.message} Search for this guest before creating another
          record.
        </Notice>
      )}
      <div className="dialog-actions">
        <button className="button" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save guest"}
        </button>
      </div>
    </form>
  );
}
