import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildApis } from "../../api/client";
import { buildBookingActions } from "../../api/bookingActions";
import {
  Configuration,
  PaymentsApi,
  ReservationApi,
} from "../../api/generated";
import { getSessionEpoch } from "../../api/session";
import { DraftContext, WorkspaceContext } from "../../app/context";
import { ReservationPayments } from "./Payments";

const actor = "00000000-0000-0000-0000-000000000001";
const key = "11111111-1111-4111-8111-111111111111";
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
const write = vi.fn();
const api = vi.fn<typeof fetch>();
const receipt = {
  id: "9007199254741001",
  reservationId: 42,
  reservationVersion: 1,
  actorId: actor,
  operationKey: key,
  kind: "PAYMENT",
  currency: "EUR",
  amountCents: 2501,
  method: "CASH",
  paymentId: null,
  reversesId: null,
  reason: null,
  reference: "Synthetic receipt",
  effectiveDate: "2026-11-07",
  recordedAt: "2026-11-07T01:00:00.123456Z",
};
const initial = () => ({
  reservation: {
    id: 42,
    customerId: 5,
    roomId: 7,
    version: 1,
    startDate: "2030-01-01",
    endDate: "2030-01-03",
    guestCount: 2,
    status: "ACTIVE",
    phase: "CONFIRMED",
    acceptedQuoteId: key,
  },
  propertyDate: "2026-11-07",
  currency: "EUR",
  agreedCents: 10002,
  accommodationCents: 10002,
  outstandingCents: 7501,
  creditCents: 0,
  totals: { paymentsCents: 2501, refundsCents: 0, receivedCents: 2501 },
});
let summary: ReturnType<typeof initial>;
let entries: (typeof receipt)[];
let cache: QueryClient;
let drafts: Map<string, unknown>;
function mount() {
  cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const config = new Configuration({ basePath: "/api/v1", fetchApi: api });
  const reservationApi = new ReservationApi(config);
  const paymentsApi = new PaymentsApi(config);
  const epoch = getSessionEpoch();
  const context = {
    apis: { ...buildApis(actor, epoch), reservationApi, paymentsApi },
    ownerId: actor,
    epoch,
    booking: {
      ...buildBookingActions(reservationApi, "payment-ui-test"),
      recordFunds: write,
    },
  };
  return render(
    <QueryClientProvider client={cache}>
      <WorkspaceContext.Provider value={context}>
        <DraftContext.Provider value={drafts}>
          <ReservationPayments id={42} />
        </DraftContext.Provider>
      </WorkspaceContext.Provider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  summary = initial();
  entries = [receipt];
  drafts = new Map();
  write.mockReset();
  api.mockReset();
  write.mockResolvedValue({ ...receipt, id: "9007199254741002" });
  api.mockImplementation(async (input) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname.endsWith("/ledger/entries"))
      return json({ items: entries, nextCursor: null });
    if (url.pathname.endsWith("/ledger/payments"))
      return json({
        items: [{ entry: receipt, refundableCents: 2501 }],
        nextCursor: null,
      });
    return json(summary);
  });
});
afterEach(() => {
  cleanup();
  cache?.clear();
});
const openPayment = async () => {
  await userEvent.click(
    await screen.findByRole("button", { name: "Record payment" }),
  );
  return within(screen.getByRole("dialog"));
};

it("requires review and an explicit final confirmation before recording received money", async () => {
  mount();
  const form = await openPayment();
  await userEvent.type(form.getByLabelText("Amount in EUR"), "25,01");
  await userEvent.click(form.getByRole("button", { name: "Review record" }));
  expect(write).not.toHaveBeenCalled();
  expect(
    form.getByRole("heading", { name: "Review payment" }),
  ).toBeInTheDocument();
  await userEvent.click(
    form.getByRole("button", { name: "Confirm payment record" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(write).toHaveBeenCalledWith(
    42,
    {
      kind: "PAYMENT",
      amountCents: 2501,
      method: "CASH",
      effectiveDate: "2026-11-07",
      reference: undefined,
    },
    1,
    false,
  );
  expect(screen.getByText(/Financial record confirmed/)).toBeInTheDocument();
});
it("rejects fractions of a cent and future dates before preparing a confirmation", async () => {
  mount();
  const form = await openPayment();
  await userEvent.type(form.getByLabelText("Amount in EUR"), "1.005");
  await userEvent.click(form.getByRole("button", { name: "Review record" }));
  expect(
    form.queryByRole("button", { name: "Confirm payment record" }),
  ).not.toBeInTheDocument();
  expect(write).not.toHaveBeenCalled();
  await userEvent.clear(form.getByLabelText("Amount in EUR"));
  await userEvent.type(form.getByLabelText("Amount in EUR"), "1.01");
  await userEvent.clear(form.getByLabelText("Payment date"));
  await userEvent.type(form.getByLabelText("Payment date"), "2026-11-08");
  await userEvent.click(
    form.getByRole("button", { name: "Check previous save" }),
  );
  expect(write).not.toHaveBeenCalled();
});
it("allows read-only refund recovery when the current receipt no longer has enough funds", async () => {
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Record refund" }),
  );
  const form = within(screen.getByRole("dialog"));
  await waitFor(() =>
    expect(
      form.getByRole("option", { name: /2501|25.01/ }),
    ).toBeInTheDocument(),
  );
  await userEvent.selectOptions(
    form.getByLabelText("Original receipt"),
    receipt.id,
  );
  await userEvent.type(form.getByLabelText("Amount in EUR"), "30");
  await userEvent.type(
    form.getByLabelText("Reason"),
    "Synthetic returned deposit",
  );
  await userEvent.click(form.getByRole("button", { name: "Review record" }));
  expect(
    form.queryByRole("button", { name: "Confirm refund record" }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    form.getByRole("button", { name: "Check previous save" }),
  );
  await waitFor(() =>
    expect(write).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        kind: "REFUND",
        paymentId: receipt.id,
        amountCents: 3000,
      }),
      1,
      true,
    ),
  );
});
it("retains the reviewed version and entered fields after closing, then requires a fresh balance for a new record", async () => {
  mount();
  let form = await openPayment();
  await userEvent.type(form.getByLabelText("Amount in EUR"), "25.01");
  await userEvent.type(
    form.getByLabelText("Receipt reference, optional"),
    "Synthetic retained reference",
  );
  await userEvent.click(form.getByRole("button", { name: "Close dialog" }));
  summary = { ...summary, reservation: { ...summary.reservation, version: 2 } };
  act(() => cache.setQueryData(["ledger", 42], summary));
  form = await openPayment();
  expect(form.getByLabelText("Amount in EUR")).toHaveValue("25.01");
  expect(form.getByLabelText("Receipt reference, optional")).toHaveValue(
    "Synthetic retained reference",
  );
  expect(form.getByRole("button", { name: "Review record" })).toBeDisabled();
  await userEvent.click(
    form.getByRole("button", { name: "Load latest balance" }),
  );
  await waitFor(() =>
    expect(form.getByRole("button", { name: "Review record" })).toBeEnabled(),
  );
  await userEvent.click(form.getByRole("button", { name: "Review record" }));
  await userEvent.click(
    form.getByRole("button", { name: "Confirm payment record" }),
  );
  await waitFor(() =>
    expect(write).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ amountCents: 2501 }),
      2,
      false,
    ),
  );
});
it("makes a full reversal a separate reasoned review and exposes no delete control", async () => {
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Correct record" }),
  );
  const form = within(screen.getByRole("dialog"));
  await userEvent.click(form.getByRole("button", { name: "Review record" }));
  expect(write).not.toHaveBeenCalled();
  await userEvent.type(
    form.getByLabelText("Reason"),
    "Synthetic duplicate receipt",
  );
  await userEvent.click(form.getByRole("button", { name: "Review record" }));
  await userEvent.click(
    form.getByRole("button", { name: "Confirm reversal record" }),
  );
  await waitFor(() =>
    expect(write).toHaveBeenCalledWith(
      42,
      {
        kind: "REVERSAL",
        entryId: receipt.id,
        amountCents: 2501,
        reason: "Synthetic duplicate receipt",
      },
      1,
      false,
    ),
  );
  expect(
    screen.queryByRole("button", { name: /delete/i }),
  ).not.toBeInTheDocument();
});
it("disables financial writes when the server summary is inconsistent", async () => {
  summary.totals.receivedCents = 2500;
  mount();
  await screen.findByText(
    "These records could not be loaded. Check your connection and try again.",
  );
  expect(screen.getByRole("button", { name: "Record payment" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Record refund" })).toBeDisabled();
});

it("does not replace a newer financial balance with a held older Load latest response", async () => {
  mount();
  const form = await openPayment();
  await userEvent.type(form.getByLabelText("Amount in EUR"), "25.01");
  const older = structuredClone(summary);
  let release!: (value: Response) => void;
  api.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  await userEvent.click(
    form.getByRole("button", { name: "Load latest balance" }),
  );
  await waitFor(() => expect(release).toBeTypeOf("function"));
  const newer = {
    ...summary,
    reservation: { ...summary.reservation, version: 2 },
    totals: { paymentsCents: 5000, refundsCents: 0, receivedCents: 5000 },
    outstandingCents: 5002,
  };
  summary = newer;
  act(() => cache.setQueryData(["ledger", 42], newer));
  await act(async () => release(json(older)));
  await waitFor(() =>
    expect(
      form.getByRole("button", { name: "Load latest balance" }),
    ).toBeEnabled(),
  );
  expect(
    cache.getQueryData<{ reservation: { version: number } }>(["ledger", 42])
      ?.reservation.version,
  ).toBe(2);
  expect(form.getByRole("button", { name: "Review record" })).toBeDisabled();
});

it("keeps a previous-reversal recovery entry point after a lost response and refreshed correction history", async () => {
  write.mockRejectedValueOnce(
    new TypeError("Synthetic lost reversal response"),
  );
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Correct record" }),
  );
  const form = within(screen.getByRole("dialog"));
  await userEvent.type(
    form.getByLabelText("Reason"),
    "Synthetic duplicate receipt",
  );
  await userEvent.click(form.getByRole("button", { name: "Review record" }));
  await userEvent.click(
    form.getByRole("button", { name: "Confirm reversal record" }),
  );
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(form.getByRole("button", { name: "Close dialog" })).toBeEnabled(),
  );
  await userEvent.click(form.getByRole("button", { name: "Close dialog" }));
  entries = [
    {
      ...receipt,
      id: "9007199254741002",
      kind: "REVERSAL",
      method: null,
      reversesId: receipt.id,
      reason: "Synthetic duplicate receipt",
      reference: null,
      reservationVersion: 2,
    } as unknown as typeof receipt,
    receipt,
  ];
  summary = {
    ...summary,
    reservation: { ...summary.reservation, version: 2 },
    totals: { paymentsCents: 0, refundsCents: 0, receivedCents: 0 },
    outstandingCents: 10002,
  };
  await act(async () => {
    await cache.invalidateQueries();
  });
  await screen.findByText("Reversed by a linked correction.");
  const original = screen
    .getByText("Reversed by a linked correction.")
    .closest("li")!;
  expect(
    within(original).getByRole("button", {
      name: /Correct record|Check previous correction|Check previous reversal/,
    }),
  ).toBeEnabled();
  await userEvent.click(
    within(original).getByRole("button", { name: "Check previous correction" }),
  );
  const recovery = within(screen.getByRole("dialog"));
  expect(
    recovery.queryByRole("button", { name: "Review record" }),
  ).not.toBeInTheDocument();
  expect(recovery.getByLabelText("Reason")).toHaveValue(
    "Synthetic duplicate receipt",
  );
  await userEvent.click(
    recovery.getByRole("button", { name: "Check previous save" }),
  );
  await waitFor(() =>
    expect(write).toHaveBeenLastCalledWith(
      42,
      {
        kind: "REVERSAL",
        entryId: receipt.id,
        amountCents: 2501,
        reason: "Synthetic duplicate receipt",
      },
      1,
      true,
    ),
  );
});

it("keeps a newer manually loaded balance when an older background read completes", async () => {
  mount();
  const form = await openPayment();
  await userEvent.type(form.getByLabelText("Amount in EUR"), "25.01");
  const older = structuredClone(summary);
  let release!: (value: Response) => void;
  api.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  let background!: Promise<void>;
  act(() => {
    background = cache.refetchQueries({
      queryKey: ["ledger", 42],
      exact: true,
    });
  });
  await waitFor(() => expect(release).toBeTypeOf("function"));
  summary = {
    ...summary,
    reservation: { ...summary.reservation, version: 2 },
    totals: { paymentsCents: 5000, refundsCents: 0, receivedCents: 5000 },
    outstandingCents: 5002,
  };
  await userEvent.click(
    form.getByRole("button", { name: "Load latest balance" }),
  );
  await waitFor(() =>
    expect(
      cache.getQueryData<{ reservation: { version: number } }>(["ledger", 42])
        ?.reservation.version,
    ).toBe(2),
  );
  await act(async () => {
    release(json(older));
    await background;
  });
  expect(
    cache.getQueryData<{ reservation: { version: number } }>(["ledger", 42])
      ?.reservation.version,
  ).toBe(2);
  expect(form.getByRole("button", { name: "Review record" })).toBeEnabled();
});
