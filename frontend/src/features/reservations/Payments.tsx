import { useEffect, useState } from "react";
import { OperationRecoveryError } from "../../api/bookingActions";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useWorkspace } from "../../app/context";
import { dateLabel, euros, eventLabel, validDate } from "../../shared/format";
import { parseEuroCents } from "../../shared/money";
import {
  ledgerHistorySchema,
  ledgerSummarySchema,
  methodLabel,
  paymentMethods,
  refundablePaymentsSchema,
  type FinancialAction,
  type LedgerEntry,
  type LedgerSummary,
  type PaymentMethod,
} from "../../shared/ledger";
import { useOnline } from "../../shared/useOnline";
import { useSave } from "../../shared/useSave";
import { useVersionedDraft } from "../../shared/useVersionedDraft";
import {
  Dialog,
  Empty,
  Field,
  Notice,
  Pending,
  QueryError,
  SelectField,
  TextArea,
} from "../../shared/ui";

type Mode = FinancialAction["kind"];
export function ReservationPayments({ id }: { id: number }) {
  const { apis } = useWorkspace();
  const cache = useQueryClient();
  const online = useOnline();
  const [open, setOpen] = useState<{
    kind: Mode;
    version: number;
    entry?: LedgerEntry;
    recoveryOnly: boolean;
  }>();
  const [saved, setSaved] = useState(false);
  const summary = useQuery({
    queryKey: ["ledger", id],
    queryFn: async ({ signal }) => {
      const data = ledgerSummarySchema.parse(
        await apis.paymentsApi.reservationLedger({ id }, { signal }),
      );
      if (data.reservation.id !== id)
        throw new Error("The financial record belongs to another reservation.");
      const cached = cache.getQueryData<LedgerSummary>(["ledger", id]);
      return cached && cached.reservation.version > data.reservation.version
        ? cached
        : data;
    },
  });
  const history = useInfiniteQuery({
    queryKey: ["ledger-history", id],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ signal, pageParam }) => {
      const data = ledgerHistorySchema.parse(
        await apis.paymentsApi.reservationLedgerHistory(
          { id, beforeId: pageParam, limit: 50 },
          { signal },
        ),
      );
      if (data.items.some((entry) => entry.reservationId !== id))
        throw new Error("The payment history could not be verified.");
      return data;
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = history.data?.pages.flatMap((page) => page.items) ?? [];
  const reversed = new Set(
    rows.flatMap((entry) => (entry.reversesId ? [entry.reversesId] : [])),
  );
  const available =
    summary.data?.agreedCents !== null &&
    !!summary.data &&
    !summary.isFetching &&
    !summary.isError &&
    online;
  const show = (kind: Mode, entry?: LedgerEntry) => {
    if (!summary.data) return;
    setSaved(false);
    setOpen({
      kind,
      entry,
      version: summary.data.reservation.version,
      recoveryOnly: kind === "REVERSAL" && !!entry && reversed.has(entry.id),
    });
  };
  return (
    <section className="panel" id="payments">
      <div className="section-heading">
        <h2>Payments</h2>
        <div className="actions">
          <button
            className="button secondary"
            disabled={!available}
            onClick={() => show("PAYMENT")}
          >
            Record payment
          </button>
          <button
            className="button secondary"
            disabled={!available}
            onClick={() => show("REFUND")}
          >
            Record refund
          </button>
        </div>
      </div>
      <p className="hint">
        Record cash, external card payments and bank transfers already completed
        outside Villas.
      </p>
      {saved && (
        <Notice>
          Financial record confirmed. The current balance is shown below.
        </Notice>
      )}
      {!online && (
        <Notice error>
          You are offline. Reconnect before confirming or checking a payment
          record.
        </Notice>
      )}
      {summary.isPending ? (
        <Pending label="Loading financial records…" />
      ) : summary.isError ? (
        <QueryError retry={() => void summary.refetch()} />
      ) : summary.data.agreedCents === null ? (
        <Notice>
          This historical booking has no agreed EUR price. Payment recording is
          unavailable.
        </Notice>
      ) : (
        <>
          <dl className="details financial-summary">
            <div>
              <dt>Accommodation owed</dt>
              <dd>{euros(summary.data.accommodationCents!)}</dd>
            </div>
            <div>
              <dt>Net received</dt>
              <dd>{euros(summary.data.totals.receivedCents)}</dd>
            </div>
            <div>
              <dt>Outstanding</dt>
              <dd>{euros(summary.data.outstandingCents!)}</dd>
            </div>
            <div>
              <dt>Credit</dt>
              <dd>{euros(summary.data.creditCents!)}</dd>
            </div>
          </dl>
          {summary.data.accommodationCents === 0 && (
            <p className="hint">
              The retained accommodation agreement is{" "}
              {euros(summary.data.agreedCents)}. Cancellation or no-show removes
              the accommodation amount owed.
            </p>
          )}
          {!!summary.data.creditCents && (
            <Notice>
              Credit stays on this booking until an Owner records a separately
              completed refund. No refund is automatic.
            </Notice>
          )}
          <p className="hint">
            Received {euros(summary.data.totals.paymentsCents)} · Refunded{" "}
            {euros(summary.data.totals.refundsCents)}. Reversed records are
            excluded from these totals.
          </p>
        </>
      )}
      {summary.isFetching && summary.data && (
        <Pending label="Refreshing balance…" />
      )}
      <h3>Payment and correction history</h3>
      {history.isPending ? (
        <Pending />
      ) : history.isError && !history.data ? (
        <QueryError retry={() => void history.refetch()} />
      ) : !rows.length ? (
        <Empty title="No payments recorded">
          Add a receipt after money has been received.
        </Empty>
      ) : (
        <ol className="history ledger-history">
          {rows.map((entry) => (
            <li key={entry.id}>
              <span className="history-dot" aria-hidden="true" />
              <div>
                <strong>
                  {entry.kind === "PAYMENT"
                    ? "Payment"
                    : entry.kind === "REFUND"
                      ? "Refund"
                      : "Correction"}{" "}
                  · {euros(entry.amountCents)}
                </strong>
                <p>
                  {methodLabel(entry.method)} · {dateLabel(entry.effectiveDate)}
                </p>
                <p className="hint">
                  Record #{entry.id} · Recorded{" "}
                  {eventLabel(new Date(entry.recordedAt))}
                </p>
                {entry.paymentId && <p>Refund of receipt #{entry.paymentId}</p>}
                {entry.reversesId && (
                  <p>Reverses record #{entry.reversesId}. No money moved.</p>
                )}
                {reversed.has(entry.id) && (
                  <p className="hint">Reversed by a linked correction.</p>
                )}
                {entry.reference && <p>Receipt reference: {entry.reference}</p>}
                {entry.reason && <p>Reason: {entry.reason}</p>}
                <div className="actions">
                  {entry.kind === "PAYMENT" && (
                    <button
                      className="text-button"
                      disabled={!available}
                      onClick={() => show("REFUND", entry)}
                    >
                      Refund or check a previous save
                    </button>
                  )}
                  {entry.kind !== "REVERSAL" && (
                    <button
                      className="text-button"
                      disabled={!available}
                      onClick={() => show("REVERSAL", entry)}
                    >
                      {reversed.has(entry.id)
                        ? "Check previous correction"
                        : "Correct record"}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {history.isError && history.data && (
        <Notice error>
          More payment history could not be loaded. Try again below.
        </Notice>
      )}
      {history.hasNextPage && (
        <button
          className="button secondary"
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          Load more payment history
        </button>
      )}
      {open && summary.data && (
        <FundsForm
          key={`${id}:${open.kind}:${open.entry?.id ?? "new"}`}
          id={id}
          kind={open.kind}
          entry={open.entry}
          recoveryOnly={
            open.recoveryOnly ||
            (open.kind === "REVERSAL" &&
              !!open.entry &&
              reversed.has(open.entry.id))
          }
          expectedVersion={open.version}
          currentVersion={summary.data.reservation.version}
          propertyDate={summary.data.propertyDate}
          onClose={() => setOpen(undefined)}
          onSaved={() => {
            setOpen(undefined);
            setSaved(true);
          }}
        />
      )}
    </section>
  );
}

type FormValue = {
  amount: string;
  method: PaymentMethod;
  effectiveDate: string;
  reference: string;
  reason: string;
  paymentId: string;
};
function FundsForm({
  id,
  kind,
  entry,
  expectedVersion,
  recoveryOnly,
  currentVersion,
  propertyDate,
  onClose,
  onSaved,
}: {
  id: number;
  kind: Mode;
  entry?: LedgerEntry;
  expectedVersion: number;
  currentVersion: number;
  recoveryOnly: boolean;
  propertyDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { apis, booking } = useWorkspace();
  const online = useOnline();
  const cache = useQueryClient();
  const draft = useVersionedDraft(
    `ledger:${id}:${kind}:${entry?.id ?? "new"}`,
    {
      amount: "",
      method: "CASH" as PaymentMethod,
      effectiveDate: propertyDate,
      reference: "",
      reason: "",
      paymentId: kind === "REFUND" ? (entry?.id ?? "") : "",
    },
    expectedVersion,
  );
  const [values, setValues] = useState<FormValue>(draft.initial);
  const [review, setReview] = useState<FinancialAction>();
  const [message, setMessage] = useState("");
  const receipts = useInfiniteQuery({
    queryKey: ["refundable-payments", id],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ signal, pageParam }) => {
      const data = refundablePaymentsSchema.parse(
        await apis.paymentsApi.refundablePayments(
          { id, beforeId: pageParam, limit: 50 },
          { signal },
        ),
      );
      if (data.items.some((item) => item.entry.reservationId !== id))
        throw new Error("Receipts could not be verified.");
      return data;
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: kind === "REFUND",
  });
  const choices = receipts.data?.pages.flatMap((page) => page.items) ?? [];
  const selected = choices.find((item) => item.entry.id === values.paymentId);
  const stale = draft.expectedVersion !== currentVersion;
  useEffect(() => {
    draft.save(values);
  }, [draft, values]);
  const save = useSave<{ action: FinancialAction; recoveryOnly: boolean }>(
    ({ action, recoveryOnly }) =>
      booking.recordFunds(id, action, draft.expectedVersion, recoveryOnly),
    () => {
      draft.clear();
      onSaved();
    },
  );
  const latest = useSave<void>(
    async () =>
      ledgerSummarySchema.parse(
        await apis.paymentsApi.reservationLedger({ id }),
      ),
    (result) => {
      const data = ledgerSummarySchema.parse(result);
      if (data.reservation.id !== id) return;
      const cached = cache.getQueryData<LedgerSummary>(["ledger", id]);
      if (cached && cached.reservation.version > data.reservation.version)
        throw new OperationRecoveryError(
          "A newer balance is already loaded. Load the latest balance again before reviewing a new record.",
        );
      cache.setQueryData(["ledger", id], data);
      draft.reload(values, data.reservation.version);
      setReview(undefined);
      setMessage("");
      save.resetStatus();
    },
    { invalidate: false, repeatable: true },
  );
  function actionFor(input: FormValue): FinancialAction | null {
    if (kind === "REVERSAL")
      return entry && input.reason.trim()
        ? {
            kind,
            entryId: entry.id,
            amountCents: entry.amountCents,
            reason: input.reason.trim(),
          }
        : null;
    const amount = parseEuroCents(input.amount);
    if (
      !amount ||
      !validDate(input.effectiveDate) ||
      input.effectiveDate > propertyDate
    )
      return null;
    const common = {
      amountCents: amount,
      method: input.method,
      effectiveDate: input.effectiveDate,
      reference: input.reference.trim() || undefined,
    };
    if (kind === "PAYMENT") return { kind, ...common };
    return /^[1-9][0-9]*$/.test(input.paymentId) && input.reason.trim()
      ? {
          kind,
          ...common,
          paymentId: input.paymentId,
          reason: input.reason.trim(),
        }
      : null;
  }
  const change = (key: keyof FormValue, value: string) => {
    setValues((old) => ({ ...old, [key]: value }));
    setReview(undefined);
    setMessage("");
    save.resetStatus();
  };
  const prepare = () => {
    if (recoveryOnly) return;
    const action = actionFor(values);
    if (
      !action ||
      values.reason.length > 500 ||
      values.reference.length > 100
    ) {
      setMessage(
        "Enter a positive amount with up to two decimals, a valid completed-payment date, and any required receipt and reason.",
      );
      return;
    }
    if (
      kind === "REFUND" &&
      (!selected ||
        action.kind !== "REFUND" ||
        action.amountCents > selected.refundableCents ||
        values.effectiveDate < selected.entry.effectiveDate)
    ) {
      setMessage(
        "Review an available receipt and its remaining refundable amount. To recover an earlier request, use Check previous save.",
      );
      return;
    }
    save.resetStatus();
    setMessage("");
    setReview(action);
  };
  const busy = save.isPending || latest.isPending;
  const title =
    kind === "PAYMENT"
      ? "Record external payment"
      : kind === "REFUND"
        ? "Record external refund"
        : "Correct financial record";
  return (
    <Dialog title={title} busy={busy} onClose={onClose}>
      <form
        aria-label={title}
        onSubmit={(event) => {
          event.preventDefault();
          prepare();
        }}
      >
        <p>
          {kind === "REVERSAL"
            ? `Reverse the full ${euros(entry!.amountCents)} record #${entry!.id}. This corrects bookkeeping and moves no money.`
            : "Only record money already received or returned outside Villas. No payment or refund is processed here."}
        </p>
        {kind === "REFUND" && (
          <>
            <SelectField
              label="Original receipt"
              disabled={busy}
              value={values.paymentId}
              onChange={(event) => change("paymentId", event.target.value)}
            >
              <option value="">Choose a receipt</option>
              {values.paymentId && !selected && (
                <option value={values.paymentId}>
                  Receipt #{values.paymentId} · Previous selection, check
                  available records
                </option>
              )}
              {choices.map((item) => (
                <option key={item.entry.id} value={item.entry.id}>
                  #{item.entry.id} · {dateLabel(item.entry.effectiveDate)} ·{" "}
                  {euros(item.entry.amountCents)} received ·{" "}
                  {euros(item.refundableCents)} refundable
                </option>
              ))}
            </SelectField>
            {receipts.isPending && <Pending label="Loading receipts…" />}
            {receipts.isError && (
              <QueryError retry={() => void receipts.refetch()} />
            )}
            {receipts.hasNextPage && (
              <button
                type="button"
                className="text-button"
                disabled={receipts.isFetchingNextPage}
                onClick={() => void receipts.fetchNextPage()}
              >
                Load more receipts
              </button>
            )}
          </>
        )}
        {kind !== "REVERSAL" && (
          <div className="form-grid">
            <Field
              label="Amount in EUR"
              disabled={busy}
              value={values.amount}
              inputMode="decimal"
              maxLength={32}
              placeholder="0.00"
              onChange={(event) => change("amount", event.target.value)}
            />
            <SelectField
              label="Payment method"
              disabled={busy}
              value={values.method}
              onChange={(event) => change("method", event.target.value)}
            >
              {paymentMethods.map((method) => (
                <option key={method} value={method}>
                  {methodLabel(method)}
                </option>
              ))}
            </SelectField>
            <Field
              label="Payment date"
              disabled={busy}
              type="date"
              min="1000-01-01"
              max={propertyDate}
              value={values.effectiveDate}
              onChange={(event) => change("effectiveDate", event.target.value)}
            />
            <Field
              label="Receipt reference, optional"
              disabled={busy}
              hint="Use a receipt reference. Never enter card details."
              maxLength={100}
              value={values.reference}
              onChange={(event) => change("reference", event.target.value)}
            />
          </div>
        )}
        {kind !== "PAYMENT" && (
          <TextArea
            label="Reason"
            disabled={busy}
            maxLength={500}
            value={values.reason}
            onChange={(event) => change("reason", event.target.value)}
          />
        )}
        {recoveryOnly && (
          <Notice>
            This record has a linked reversal. Check the previous correction
            save using its original reason. A new reversal is unavailable.
          </Notice>
        )}
        {message && <Notice error>{message}</Notice>}
        {save.message && <Notice error>{save.message}</Notice>}
        {latest.message && <Notice error>{latest.message}</Notice>}
        {(stale || save.stale) && (
          <Notice error>
            The booking or its funds changed. Check a previous save first, then
            load the latest balance before reviewing a new record.
          </Notice>
        )}
        <div className="actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy || !online}
            onClick={() => {
              const action = actionFor(values);
              if (action) void save.submit({ action, recoveryOnly: true });
              else
                setMessage(
                  "Re-enter the original amount, date, receipt and reason to check the previous save.",
                );
            }}
          >
            Check previous save
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy || !online}
            onClick={() => void latest.submit()}
          >
            Load latest balance
          </button>
        </div>
        {review && (
          <section
            className="quote-review"
            aria-label="Review financial record"
          >
            <h3>
              Review{" "}
              {review.kind === "PAYMENT"
                ? "payment"
                : review.kind === "REFUND"
                  ? "refund"
                  : "correction"}
            </h3>
            <p>
              <strong>{euros(review.amountCents)}</strong>
              {review.kind !== "REVERSAL" && (
                <>
                  {" "}
                  · {methodLabel(review.method)} ·{" "}
                  {dateLabel(review.effectiveDate)}
                </>
              )}
            </p>
            {review.kind === "REFUND" && (
              <p>
                Refund against receipt #{review.paymentId}. This must already
                have been completed outside Villas.
              </p>
            )}
            {review.kind === "REVERSAL" && (
              <p>Full reversal of record #{review.entryId}. No money moves.</p>
            )}
            {review.kind !== "PAYMENT" && <p>Reason: {review.reason}</p>}
            {review.kind !== "REVERSAL" && review.reference && (
              <p>Receipt reference: {review.reference}</p>
            )}
            <button
              type="button"
              className="button"
              disabled={busy || !online || stale || save.stale || recoveryOnly}
              onClick={() =>
                void save.submit({ action: review, recoveryOnly: false })
              }
            >
              {busy
                ? "Confirming…"
                : kind === "PAYMENT"
                  ? "Confirm payment record"
                  : kind === "REFUND"
                    ? "Confirm refund record"
                    : "Confirm reversal record"}
            </button>
          </section>
        )}
        {!review && !recoveryOnly && (
          <div className="dialog-actions">
            <button
              className="button"
              disabled={busy || !online || stale || save.stale || recoveryOnly}
            >
              Review record
            </button>
          </div>
        )}
      </form>
    </Dialog>
  );
}
