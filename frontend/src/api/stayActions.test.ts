import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildBookingActions } from "./bookingActions";
import { Configuration, OperationsApi, ReservationApi } from "./generated";
const actor = "00000000-0000-0000-0000-000000000001";
const api = vi.fn<typeof fetch>();
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const client = () =>
  buildBookingActions(
    new ReservationApi(new Configuration({ basePath: "/api/v1" })),
    "stay-test",
    "login",
    undefined,
    undefined,
    undefined,
    {
      operations: new OperationsApi(new Configuration({ basePath: "/api/v1" })),
      actorId: actor,
    },
  );
const key = () =>
  new Headers(api.mock.calls[0][1]?.headers).get("Idempotency-Key")!;
const saved = (stable: string) => ({
  key: stable,
  kind: "CHECK_IN",
  resourceId: 42,
  reservation: {
    id: 42,
    version: 1,
    customerId: 5,
    roomId: 7,
    startDate: "2026-11-07",
    endDate: "2026-11-09",
    guestCount: 2,
    status: "ACTIVE",
    phase: "CHECKED_IN",
    checkedInAt: "2026-11-07T10:00:00.123456Z",
  },
  readiness: {
    roomId: 7,
    state: "CLEAN",
    version: 3,
    changedAt: "2026-11-07T09:00:00Z",
  },
  inventoryEvent: {
    id: "9007199254741001",
    actorId: actor,
    operationKey: stable,
    resourceVersion: 1,
    kind: "CHECKED_IN",
    phase: "CHECKED_IN",
    roomId: 7,
    startDate: "2026-11-07",
    endDate: "2026-11-09",
    guestCount: 2,
    checkedInAt: "2026-11-07T10:00:00.123456Z",
    occurredAt: "2026-11-07T10:00:00.123456Z",
  },
});
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  api.mockReset();
  vi.stubGlobal("fetch", api);
});
afterEach(() => vi.unstubAllGlobals());
it("recovers the original check-in after later stay changes and never substitutes a new readiness version", async () => {
  api.mockRejectedValueOnce(new TypeError("Lost arrival response"));
  await expect(
    client().operateStay(42, { kind: "CHECK_IN" }, 0, 3),
  ).rejects.toThrow();
  const stable = key();
  expect(JSON.stringify(localStorage)).not.toContain("2026-11-07");
  api.mockResolvedValueOnce(json(saved(stable)));
  await expect(
    client().operateStay(42, { kind: "CHECK_IN" }, 15, 22, true),
  ).resolves.toMatchObject({ phase: "CHECKED_IN", version: 1 });
  expect(
    api.mock.calls.filter(([, init]) => init?.method === "POST"),
  ).toHaveLength(1);
  expect(localStorage.getItem("villarosa.pendingOperations.v2")).toBe("{}");
});
it("keeps the original readiness review on an explicit retry after a definitive uncommitted lookup", async () => {
  api.mockRejectedValueOnce(new TypeError("Connection lost"));
  await expect(
    client().operateStay(42, { kind: "CHECK_IN" }, 0, 3),
  ).rejects.toThrow();
  const stable = key();
  api
    .mockResolvedValueOnce(json({ code: "OPERATION_NOT_COMMITTED" }, 404))
    .mockResolvedValueOnce(json({}))
    .mockResolvedValueOnce(json(saved(stable)));
  await client().operateStay(42, { kind: "CHECK_IN" }, 9, 18);
  expect(JSON.parse(String(api.mock.calls[2][1]?.body))).toEqual({
    expectedVersion: 0,
    readinessVersion: 3,
  });
});
it.each([
  { actorId: "00000000-0000-0000-0000-000000000002" },
  { resourceVersion: 2 },
  { phase: "CHECKED_OUT" },
  { roomId: 8 },
  { reason: "Different" },
  { checkedInAt: "2026-11-07T10:00:00.123455Z" },
  { startDate: "2026-11-06" },
  { guestCount: 3 },
])(
  "retains the pending key for inconsistent historical proof %j",
  async (patch) => {
    api.mockResolvedValueOnce(json({})).mockImplementationOnce(async () => {
      const value = saved(key());
      return json({
        ...value,
        inventoryEvent: { ...value.inventoryEvent, ...patch },
      });
    });
    await expect(
      client().operateStay(42, { kind: "CHECK_IN" }, 0, 3),
    ).rejects.toThrow();
    expect(localStorage.getItem("villarosa.pendingOperations.v2")).toContain(
      key(),
    );
  },
);
it("rejects a historical check-in result with different readiness proof", async () => {
  api.mockResolvedValueOnce(json({})).mockImplementationOnce(async () => {
    const value = saved(key());
    return json({ ...value, readiness: { ...value.readiness, version: 4 } });
  });
  await expect(
    client().operateStay(42, { kind: "CHECK_IN" }, 0, 3),
  ).rejects.toThrow();
  expect(localStorage.getItem("villarosa.pendingOperations.v2")).toContain(
    key(),
  );
});
it("performs no lookup or write for read-only recovery without an original intent", async () => {
  await expect(
    client().operateStay(42, { kind: "CHECK_IN" }, 0, undefined, true),
  ).rejects.toThrow("No previous booking save");
  expect(api).not.toHaveBeenCalled();
});
it("retains reasons only in the hashed identity and clears a definitely rejected stay request", async () => {
  api.mockResolvedValueOnce(json({ code: "NO_SHOW_DATE" }, 409));
  await expect(
    client().operateStay(
      42,
      { kind: "NO_SHOW", reason: "Synthetic absent guest" },
      0,
    ),
  ).rejects.toThrow();
  expect(localStorage.getItem("villarosa.pendingOperations.v2")).toBe("{}");
  expect(JSON.stringify(sessionStorage)).not.toContain(
    "Synthetic absent guest",
  );
});

it("retains an unknown correction when a claimed no-op result names another resource", async () => {
  const correctedAt = "2026-11-07T10:00:00.123456Z";
  api.mockResolvedValueOnce(json({})).mockImplementationOnce(async () => {
    const original = saved(key());
    return json({
      ...original,
      kind: "CORRECT_STAY",
      resourceId: 43,
      reservation: {
        ...original.reservation,
        version: 0,
        checkedInAt: correctedAt,
      },
      inventoryEvent: undefined,
    });
  });
  await expect(
    client().operateStay(
      42,
      {
        kind: "CORRECT_STAY",
        checkedInAt: correctedAt,
        reason: "Synthetic time correction",
      },
      0,
    ),
  ).rejects.toThrow();
  expect(localStorage.getItem("villarosa.pendingOperations.v2")).toContain(
    key(),
  );
});

it("recovers an exact earlier arrival correction at the original version without replaying it after checkout", async () => {
  const correctedAt = "2026-11-07T10:00:00.123456Z";
  const action = {
    kind: "CORRECT_STAY" as const,
    checkedInAt: correctedAt,
    reason: "Synthetic arrival correction",
  };
  api.mockRejectedValueOnce(
    new TypeError("Synthetic lost correction response"),
  );
  await expect(client().operateStay(42, action, 0)).rejects.toThrow();
  const stable = key();
  const original = saved(stable);
  api.mockResolvedValueOnce(
    json({
      ...original,
      kind: "CORRECT_STAY",
      inventoryEvent: {
        ...original.inventoryEvent,
        kind: "CORRECTED",
        reason: action.reason,
      },
    }),
  );
  await expect(
    client().operateStay(42, action, 8, undefined, true),
  ).resolves.toMatchObject({ version: 1, checkedInAt: correctedAt });
  expect(
    api.mock.calls.filter(([, init]) => init?.method === "POST"),
  ).toHaveLength(1);
  expect(JSON.stringify([localStorage, sessionStorage])).not.toContain(
    action.reason,
  );
});
