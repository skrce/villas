import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { useWorkspace } from "../../app/context";
import { guestSearchSchema } from "../../shared/schemas";
import { useDraft } from "../../shared/useDraft";
import { GuestForm } from "./Form";
import {
  Dialog,
  Empty,
  Field,
  Notice,
  PageHead,
  Pending,
  QueryError,
  RecordState,
  Table,
} from "../../shared/ui";

type SearchFields = z.infer<typeof guestSearchSchema>;
export function Guests() {
  const { apis } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<number>();
  const draft = useDraft<SearchFields>("guest-search", {
    name: "",
    phone: "",
    includeArchived: false,
  });
  const form = useForm<SearchFields>({
    defaultValues: draft.initial,
    resolver: zodResolver(guestSearchSchema),
  });
  useEffect(
    () =>
      form.subscribe({
        formState: { values: true },
        callback: ({ values }) => draft.save(values),
      }),
    [form, draft],
  );
  const [criteria, setCriteria] = useState(draft.initial);
  const query = useInfiniteQuery({
    queryKey: ["guests", "directory", criteria],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      apis.customerApi.queryCustomers(
        { guestQueryRequest: { ...criteria, afterId: pageParam, limit: 50 } },
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
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
        Find your guests, manage their details and review their stays.
      </PageHead>
      {created && (
        <Notice>
          Guest saved. <Link to={`/guests/${created}`}>View guest details</Link>
        </Notice>
      )}
      <section className="panel">
        <h2>Guest directory</h2>
        <form
          className="form-row"
          aria-label="Search guests"
          noValidate
          onSubmit={form.handleSubmit((values) => {
            if (JSON.stringify(criteria) === JSON.stringify(values))
              void query.refetch();
            else setCriteria(values);
          })}
        >
          <Field
            label="Name"
            autoComplete="off"
            {...form.register("name")}
            error={form.formState.errors.name?.message}
            hint="First, last or full name."
          />
          <Field
            label="Phone"
            type="tel"
            autoComplete="off"
            {...form.register("phone")}
            error={form.formState.errors.phone?.message}
          />
          <label className="checkbox-field">
            <input type="checkbox" {...form.register("includeArchived")} />
            Include archived guests
          </label>
          <button className="button secondary" disabled={query.isFetching}>
            Search guests
          </button>
        </form>
        <p className="hint">
          Name and phone filters apply together. Contact details stay out of the
          address bar.
        </p>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Guests</h2>
          {query.data && <span className="count">{items.length} shown</span>}
        </div>
        {query.isPending ? (
          <Pending />
        ) : query.isError ? (
          <QueryError retry={() => void query.refetch()} />
        ) : !items.length ? (
          <Empty headingLevel={2} title="No matching guests">
            Clear the filters or add a guest. Only names are required.
          </Empty>
        ) : (
          <Table
            label="Guest search results"
            headings={["Guest", "Contact", "Status", ""]}
          >
            {items.map((guest) => (
              <tr key={guest.id}>
                <td>
                  <strong>
                    {guest.firstName} {guest.lastName}
                  </strong>
                </td>
                <td>
                  {guest.phone || "No phone"}
                  <small className="table-secondary">
                    {guest.email || "No email"}
                  </small>
                </td>
                <td>
                  <RecordState active={guest.active} />
                </td>
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
        )}
        {query.hasNextPage && (
          <button
            className="button secondary load-more"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more guests"}
          </button>
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
