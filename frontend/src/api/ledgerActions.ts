import { GetOperationKindEnum, type PaymentsApi, type OperationResult } from "./generated";
import type { OperationRunner } from "./bookingActions";
import { entryMatches, ledgerEntrySchema, type FinancialAction } from "../shared/ledger";
import { validVersion } from "../shared/format";

export const buildLedgerActions = (run: OperationRunner, payments?: PaymentsApi, actorId?: string) => ({
  recordFunds: (id: number, supplied: FinancialAction, expectedVersion: number, recoveryOnly = false) => {
    const action: FinancialAction = supplied.kind === "REVERSAL" ? {...supplied, reason: supplied.reason.trim()}
      : supplied.kind === "REFUND" ? {...supplied, reason: supplied.reason.trim(), reference: supplied.reference?.trim() || undefined}
        : {...supplied, reference: supplied.reference?.trim() || undefined};
    const kind = action.kind === "PAYMENT" ? GetOperationKindEnum.RecordPayment
      : action.kind === "REFUND" ? GetOperationKindEnum.RecordRefund : GetOperationKindEnum.ReverseEntry;
    const input = action.kind === "REVERSAL" ? [id, action.kind, action.entryId, action.amountCents, action.reason]
      : [id, action.kind, action.amountCents, action.method, action.effectiveDate, action.reference ?? null,
          ...(action.kind === "REFUND" ? [action.paymentId, action.reason] : [])];
    return run(kind, ["ledger-v1", ...input], async () => expectedVersion,
      (intent) => {
        if (!payments) throw new Error("Payment recording is unavailable. Reload the workspace.");
        const common = {id, idempotencyKey: intent.key};
        if (action.kind === "REVERSAL") return payments.reverseLedgerEntry({...common, entryId: action.entryId,
          reversalRequest: {reason: action.reason, expectedVersion: intent.expectedVersion!}});
        const body = {amountCents: action.amountCents, method: action.method, effectiveDate: action.effectiveDate,
          expectedVersion: intent.expectedVersion!, currency: "EUR", reference: action.reference};
        return action.kind === "PAYMENT" ? payments.recordPayment({...common, paymentRequest: body})
          : payments.recordRefund({...common, refundRequest: {...body, paymentId: action.paymentId, reason: action.reason}});
      }, (result: OperationResult, intent) => {
        const entry = ledgerEntrySchema.parse(result.ledgerEntry);
        if (!actorId || result.resourceId !== id || entry.reservationId !== id || entry.actorId !== actorId
          || entry.operationKey !== intent.key || entry.reservationVersion !== intent.expectedVersion! + 1
          || result.reservation?.id !== id || !validVersion(result.reservation.version)
          || result.reservation.version !== entry.reservationVersion || !entryMatches(entry, action))
          throw new Error("The saved financial record could not be confirmed. Keep these details and check the previous save.");
        return entry;
      }, recoveryOnly);
  },
});
