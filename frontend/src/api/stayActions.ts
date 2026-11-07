import {
  GetOperationKindEnum,
  type OperationsApi,
  type QuotesApi,
  type OperationResult,
} from "./generated";
import type { OperationRunner } from "./bookingActions";
import { operationalStaySchema, type StayAction } from "../shared/stays";
import { readinessSchema } from "../shared/operations";
import { quoteSchema } from "../shared/pricing";
import { validDate } from "../shared/format";

const day = (value?: Date) =>
  value instanceof Date && Number.isFinite(value.getTime())
    ? value.toISOString().slice(0, 10)
    : undefined;
function proof(
  result: OperationResult,
  id: number,
  expected: number | undefined,
  actorId: string | undefined,
  eventKind: string,
  reason: string | null,
) {
  const saved = operationalStaySchema.parse(result.reservation);
  const event = result.inventoryEvent;
  if (
    result.resourceId !== id ||
    saved.id !== id ||
    saved.version !== expected! + 1 ||
    !actorId ||
    !event ||
    !/^[1-9][0-9]*$/.test(event.id) ||
    event.actorId !== actorId ||
    event.operationKey !== result.key ||
    event.resourceVersion !== saved.version ||
    event.kind !== eventKind ||
    event.roomId !== saved.roomId ||
    event.phase !== saved.phase ||
    (event.reason ?? null) !== reason ||
    day(event.startDate) !== saved.startDate ||
    day(event.endDate) !== saved.endDate ||
    !validDate(day(event.startDate) ?? "") ||
    event.guestCount !== saved.guestCount ||
    (event.checkedInAt ?? null) !== (saved.checkedInAt ?? null) ||
    (event.checkedOutAt ?? null) !== (saved.checkedOutAt ?? null) ||
    !(event.occurredAt instanceof Date) ||
    !Number.isFinite(event.occurredAt.getTime())
  )
    throw new Error(
      "The saved stay action could not be confirmed. Keep the original details and check the previous save.",
    );
  return saved;
}
export const buildStayActions = (
  run: OperationRunner,
  api?: OperationsApi,
  quotes?: QuotesApi,
  actorId?: string,
) => ({
  operateStay: (
    id: number,
    action: StayAction,
    expectedVersion: number,
    readinessVersion?: number,
    recoveryOnly = false,
  ) => {
    const reason = "reason" in action ? action.reason.trim() || null : null;
    const input =
      action.kind === "CORRECT_STAY"
        ? [action.kind, action.checkedInAt, action.checkedOutAt ?? null, reason]
        : action.kind === "CHECK_OUT"
          ? [action.kind, action.acknowledgeBalance, reason]
          : [action.kind, reason];
    return run(
      action.kind,
      ["stay-v1", id, ...input],
      async () => expectedVersion,
      (intent) => {
        if (!api)
          throw new Error(
            "Stay operations are unavailable. Reload the workspace.",
          );
        const common = { id, idempotencyKey: intent.key };
        const version = intent.expectedVersion!;
        switch (action.kind) {
          case "CHECK_IN":
            if (intent.readinessVersion === undefined)
              throw new Error(
                "Review the current clean room before confirming.",
              );
            return api.checkInStay({
              ...common,
              checkInRequest: {
                expectedVersion: version,
                readinessVersion: intent.readinessVersion,
              },
            });
          case "CHECK_OUT":
            return api.checkOutStay({
              ...common,
              checkOutRequest: {
                expectedVersion: version,
                acknowledgeBalance: action.acknowledgeBalance,
                reason: reason ?? undefined,
              },
            });
          case "NO_SHOW":
            return api.recordNoShow({
              ...common,
              stayReasonRequest: { expectedVersion: version, reason: reason! },
            });
          case "CANCEL":
            return api.cancelStay({
              ...common,
              stayReasonRequest: { expectedVersion: version, reason: reason! },
            });
          case "CORRECT_STAY":
            return api.correctStayTimes({
              ...common,
              actualTimesRequest: {
                expectedVersion: version,
                checkedInAt: action.checkedInAt,
                checkedOutAt: action.checkedOutAt,
                reason: reason!,
              },
            });
        }
      },
      (result, intent) => {
        const corrected = action.kind === "CORRECT_STAY";
        const noOp =
          corrected &&
          !result.inventoryEvent &&
          result.reservation?.version === intent.expectedVersion;
        const saved = noOp
          ? operationalStaySchema.parse(result.reservation)
          : proof(
              result,
              id,
              intent.expectedVersion,
              actorId,
              corrected
                ? "CORRECTED"
                : action.kind === "CHECK_IN"
                  ? "CHECKED_IN"
                  : action.kind === "CHECK_OUT"
                    ? "CHECKED_OUT"
                    : action.kind === "CANCEL"
                      ? "CANCELLED"
                      : "NO_SHOW",
              reason,
            );
        if (
          result.resourceId !== id ||
          saved.id !== id ||
          (corrected
            ? saved.checkedInAt !== action.checkedInAt ||
              (saved.checkedOutAt ?? null) !== (action.checkedOutAt ?? null)
            : saved.phase !==
              (action.kind === "CHECK_IN"
                ? "CHECKED_IN"
                : action.kind === "CHECK_OUT"
                  ? "CHECKED_OUT"
                  : action.kind === "CANCEL"
                    ? "CANCELLED"
                    : "NO_SHOW"))
        )
          throw new Error(
            "The saved stay outcome does not match these details. Check the previous save.",
          );
        if (action.kind === "CHECK_IN" || action.kind === "CHECK_OUT") {
          const ready = readinessSchema.parse(result.readiness);
          if (
            ready.roomId !== saved.roomId ||
            ready.state !== (action.kind === "CHECK_IN" ? "CLEAN" : "DIRTY") ||
            (action.kind === "CHECK_IN" &&
              ready.version !== intent.readinessVersion)
          )
            throw new Error("The saved room readiness could not be confirmed.");
        }
        return saved;
      },
      recoveryOnly,
      undefined,
      readinessVersion,
    );
  },
  editStay: (
    id: number,
    target: {
      roomId: number;
      startDate: string;
      endDate: string;
      guestCount: number;
    },
    reason: string,
    expectedVersion: number,
    quoteId?: string,
    readinessVersion?: number,
    recoveryOnly = false,
    move = false,
  ) => {
    const explanation = reason.trim();
    const kind = move ? GetOperationKindEnum.Move : GetOperationKindEnum.Change;
    const identity = move
      ? [target.roomId]
      : [target.startDate, target.endDate, target.guestCount];
    return run(
      kind,
      ["stay-edit-v1", id, ...identity, explanation],
      async () => expectedVersion,
      (intent) => {
        if (!api)
          throw new Error(
            "Stay operations are unavailable. Reload the workspace.",
          );
        const common = { id, idempotencyKey: intent.key };
        return move
          ? api.moveStay({
              ...common,
              operationalMoveRequest: {
                roomId: target.roomId,
                reason: explanation,
                expectedVersion: intent.expectedVersion!,
                quoteId: intent.quoteId,
                readinessVersion: intent.readinessVersion,
              },
            })
          : api.changeStay({
              ...common,
              operationalChangeRequest: {
                startDate: target.startDate,
                endDate: target.endDate,
                guestCount: target.guestCount,
                reason: explanation,
                expectedVersion: intent.expectedVersion!,
                quoteId: intent.quoteId,
              },
            });
      },
      async (result, intent) => {
        const saved = proof(
          result,
          id,
          intent.expectedVersion,
          actorId,
          move ? "MOVED" : "CHANGED",
          explanation,
        );
        if (!intent.quoteId || !quotes)
          throw new Error("The accepted quote could not be confirmed.");
        const offer = quoteSchema.parse(
          await quotes.getBookingQuote({ quoteId: intent.quoteId }),
        );
        if (
          offer.id !== intent.quoteId ||
          saved.acceptedQuoteId !== intent.quoteId ||
          saved.roomId !== offer.roomId ||
          saved.startDate !== offer.startDate ||
          saved.endDate !== offer.endDate ||
          saved.guestCount !== offer.guestCount ||
          (move
            ? saved.roomId !== target.roomId
            : saved.startDate !== target.startDate ||
              saved.endDate !== target.endDate ||
              saved.guestCount !== target.guestCount)
        )
          throw new Error(
            "The saved change and accepted whole-stay quote do not match.",
          );
        if (move && saved.phase === "CHECKED_IN") {
          const ready = readinessSchema.parse(result.readiness);
          if (
            ready.roomId !== saved.roomId ||
            ready.state !== "CLEAN" ||
            ready.version !== intent.readinessVersion
          )
            throw new Error(
              "The saved destination readiness could not be confirmed.",
            );
        }
        return saved;
      },
      recoveryOnly,
      quoteId,
      readinessVersion,
    );
  },
});
