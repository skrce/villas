import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBookingActions } from "./bookingActions";
import { Configuration, PaymentsApi, ReservationApi } from "./generated";
import type { FinancialAction } from "../shared/ledger";

const actor = "00000000-0000-0000-0000-000000000001";
const quote = "11111111-1111-4111-8111-111111111111";
const api = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const client = (scope = "ledger-test", generation = scope) => buildBookingActions(new ReservationApi(new Configuration({basePath: "/api/v1"})), scope, generation,
  undefined, undefined, undefined, { payments: new PaymentsApi(new Configuration({basePath: "/api/v1"})), actorId: actor });
const action: FinancialAction = {kind: "PAYMENT", amountCents: 2501, method: "CASH", effectiveDate: "2026-11-07", reference: "Synthetic receipt"};
const key = (index = 0) => new Headers(api.mock.calls[index][1]?.headers).get("Idempotency-Key")!;
const result = (stable: string, supplied: FinancialAction = action) => {
  const kind = supplied.kind === "PAYMENT" ? "RECORD_PAYMENT" : supplied.kind === "REFUND" ? "RECORD_REFUND" : "REVERSE_ENTRY";
  return { key: stable, kind, resourceId: 42,
    reservation: {id: 42, customerId: 5, roomId: 7, startDate: "2030-01-01", endDate: "2030-01-03", guestCount: 2, nights: 2, version: 6, status: "ACTIVE", phase: "CONFIRMED", acceptedQuoteId: quote},
    ledgerEntry: { id: "9007199254741001", reservationId: 42, reservationVersion: 6, actorId: actor, operationKey: stable,
      kind: supplied.kind, currency: "EUR", amountCents: supplied.amountCents, method: supplied.kind === "REVERSAL" ? null : supplied.method,
      paymentId: supplied.kind === "REFUND" ? supplied.paymentId : null, reversesId: supplied.kind === "REVERSAL" ? supplied.entryId : null,
      reason: supplied.kind === "PAYMENT" ? null : supplied.reason, reference: supplied.kind === "REVERSAL" ? null : supplied.reference ?? null,
      effectiveDate: supplied.kind === "REVERSAL" ? "2026-11-07" : supplied.effectiveDate, recordedAt: "2026-11-07T01:00:00.123456Z" } };
};
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); api.mockReset(); vi.stubGlobal("fetch", api); });
afterEach(() => vi.unstubAllGlobals());

describe("financial operation recovery", () => {
  it("reads back a confirmed receipt before clearing its key and never persists raw financial details", async () => {
    api.mockResolvedValueOnce(json({})).mockImplementationOnce(async () => json(result(key())));
    const saved = await client().recordFunds(42, action, 5);
    expect(saved.id).toBe("9007199254741001");
    expect(JSON.parse(String(api.mock.calls[0][1]?.body))).toEqual({amountCents: 2501, method: "CASH", effectiveDate: "2026-11-07", expectedVersion: 5, currency: "EUR", reference: "Synthetic receipt"});
    expect(api.mock.calls[1][1]?.method).toBe("GET");
    expect(localStorage.getItem("villarosa.pendingOperations.v2")).toBe("{}");
  });
  it("reconciles a lost receipt response after cancellation using its original reviewed version without a second POST", async () => {
    api.mockRejectedValueOnce(new TypeError("Connection lost"));
    await expect(client().recordFunds(42, action, 5)).rejects.toThrow();
    const stable = key();
    const storage = JSON.stringify([localStorage, sessionStorage]);
    for (const raw of ["2501", "2026-11-07", "Synthetic receipt", "CASH"]) expect(storage).not.toContain(raw);
    api.mockResolvedValueOnce(json(result(stable)));
    await expect(client("ledger-test", "next-login").recordFunds(42, action, 12, true)).resolves.toMatchObject({id: "9007199254741001"});
    expect(api.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("retains an uncommitted read-only recovery without automatically posting", async () => {
    api.mockRejectedValueOnce(new TypeError("Connection lost"));
    await expect(client().recordFunds(42, action, 5)).rejects.toThrow();
    api.mockResolvedValueOnce(json({code: "OPERATION_NOT_COMMITTED"}, 404));
    await expect(client().recordFunds(42, action, 8, true)).rejects.toThrow("No committed financial result");
    expect(localStorage.getItem("villarosa.pendingOperations.v2")).toContain(key());
    expect(api).toHaveBeenCalledTimes(2);
  });
  it("does not create a key or contact the server for an absent read-only recovery", async () => {
    await expect(client().recordFunds(42, action, 5, true)).rejects.toThrow("No previous financial save");
    expect(api).not.toHaveBeenCalled();
    expect(localStorage.getItem("villarosa.pendingOperations.v2")).toBeNull();
  });
  it.each([
    ["another receipt amount", {amountCents: 2502}], ["another booking", {reservationId: 43}],
    ["another Owner", {actorId: "00000000-0000-0000-0000-000000000002"}],
    ["another version", {reservationVersion: 7}], ["another date", {effectiveDate: "2026-11-06"}],
    ["another method", {method: "CARD"}], ["another reference", {reference: "Other"}],
    ["an imprecise ID", {id: 9007199254741000}], ["a missing record", undefined],
  ])("keeps the intent when reconciliation returns %s", async (_label, patch) => {
    api.mockResolvedValueOnce(json({})).mockImplementationOnce(async () => { const saved = result(key()); return json({...saved, ledgerEntry: patch ? {...saved.ledgerEntry, ...patch} : undefined}); });
    await expect(client().recordFunds(42, action, 5)).rejects.toThrow();
    const stable = key();
    expect(localStorage.getItem("villarosa.pendingOperations.v2")).toContain(stable);
    api.mockResolvedValueOnce(json(result(stable)));
    await expect(client().recordFunds(42, action, 99, true)).resolves.toMatchObject({amountCents: 2501});
  });
  it.each<FinancialAction>([
    {kind: "REFUND", paymentId: "9007199254740999", amountCents: 501, method: "BANK_TRANSFER", effectiveDate: "2026-11-07", reason: "Synthetic returned deposit"},
    {kind: "REVERSAL", entryId: "9007199254740999", amountCents: 501, reason: "Synthetic duplicate record"},
  ])("records and verifies linked $kind entries with exact string IDs", async (input) => {
    api.mockResolvedValueOnce(json({})).mockImplementationOnce(async () => json(result(key(), input)));
    const saved = await client().recordFunds(42, input, 5);
    expect(saved.kind).toBe(input.kind);
    expect(api.mock.calls[0][0]).toContain(input.kind === "REFUND" ? "/ledger/refunds" : "/9007199254740999/reversal");
  });
  it("clears definitively rejected keys so an explicit fresh review can use the current version", async () => {
    api.mockResolvedValueOnce(json({code: "STALE_VERSION"}, 409));
    await expect(client().recordFunds(42, action, 5)).rejects.toThrow();
    expect(localStorage.getItem("villarosa.pendingOperations.v2")).toBe("{}");
    api.mockResolvedValueOnce(json({})).mockImplementationOnce(async () => { const saved = result(key(1)); saved.reservation.version = 9; saved.ledgerEntry.reservationVersion = 9; return json(saved); });
    await expect(client().recordFunds(42, action, 8)).resolves.toMatchObject({reservationVersion: 9});
    expect(key(0)).not.toBe(key(1));
  });
});
