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
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildApis } from "../../api/client";
import { buildBookingActions } from "../../api/bookingActions";
import {
  Configuration,
  OperationsApi,
  PaymentsApi,
  ReservationApi,
  type ReservationInfo,
} from "../../api/generated";
import { getSessionEpoch } from "../../api/session";
import { DraftContext, WorkspaceContext } from "../../app/context";
import { useReservation } from "./queries";
import { StayOperationsPanel } from "./StayOperations";
const actor = "00000000-0000-0000-0000-000000000001",
  quote = "11111111-1111-4111-8111-111111111111";
const api = vi.fn<typeof fetch>(),
  write = vi.fn();
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
let record: ReservationInfo,
  ready: string,
  cache: QueryClient,
  options: Map<string, { utc: string; offset: string }[]>;
const balance = () => ({
  reservation: record,
  propertyDate: "2026-11-07",
  currency: "EUR",
  agreedCents: 10002,
  accommodationCents: 10002,
  outstandingCents: 10002,
  creditCents: 0,
  totals: { paymentsCents: 0, refundsCents: 0, receivedCents: 0 },
});
function mount() {
  cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const epoch = getSessionEpoch(),
    config = new Configuration({ basePath: "/api/v1", fetchApi: api }),
    reservationApi = new ReservationApi(config),
    operationsApi = new OperationsApi(config),
    paymentsApi = new PaymentsApi(config);
  const context = {
    businessId: "villa-rosa",
    businessName: "Synthetic business",
    ownerId: actor,
    epoch,
    apis: {
      ...buildApis(actor, epoch),
      reservationApi,
      operationsApi,
      paymentsApi,
    },
    booking: {
      ...buildBookingActions(reservationApi, "stay-ui-test"),
      operateStay: write,
    },
  };
  function Panel() {
    const query = useReservation(42);
    return query.data ? <StayOperationsPanel reservation={query.data} /> : null;
  }
  return render(
    <MemoryRouter>
      <QueryClientProvider client={cache}>
        <WorkspaceContext.Provider value={context}>
          <DraftContext.Provider value={new Map()}>
            <Panel />
          </DraftContext.Provider>
        </WorkspaceContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  record = {
    id: 42,
    customerId: 5,
    roomId: 7,
    startDate: "2026-11-07",
    endDate: "2026-11-09",
    guestCount: 2,
    version: 0,
    status: "ACTIVE",
    phase: "CONFIRMED",
    acceptedQuoteId: quote,
  };
  ready = "DIRTY";
  options = new Map();
  api.mockReset();
  write.mockReset();
  write.mockImplementation(async (_id, action) => {
    record = {
      ...record,
      version: record.version! + 1,
      phase:
        action.kind === "CHECK_IN"
          ? "CHECKED_IN"
          : action.kind === "CHECK_OUT"
            ? "CHECKED_OUT"
            : action.kind === "NO_SHOW"
              ? "NO_SHOW"
              : action.kind === "CANCEL"
                ? "CANCELLED"
                : record.phase,
      checkedInAt:
        action.kind === "CHECK_IN"
          ? "2026-11-07T10:00:00.123456Z"
          : record.checkedInAt,
    };
    return record;
  });
  api.mockImplementation(async (input, init) => {
    const path = new URL(String(input), "http://localhost").pathname;
    if (path.endsWith("/readiness"))
      return json({
        roomId: 7,
        state: ready,
        version: 3,
        changedAt: "2026-11-07T09:00:00Z",
      });
    if (path.endsWith("/ledger")) return json(balance());
    if (path.endsWith("/property-time/options")) {
      const local = JSON.parse(String(init?.body)).localDateTime;
      return json({
        timezone: "Europe/Skopje",
        localDateTime: local,
        options: options.get(local) ?? [{ utc: local + "Z", offset: "+01:00" }],
      });
    }
    return json(record);
  });
});
afterEach(() => {
  cleanup();
  cache?.clear();
});
async function open(title: string) {
  await userEvent.click(await screen.findByRole("button", { name: title }));
  return within(screen.getByRole("dialog", { name: title }));
}
it("blocks check-in to a dirty room and provides no readiness override", async () => {
  mount();
  const dialog = await open("Check in guest");
  await userEvent.click(dialog.getByRole("button", { name: "Review action" }));
  await dialog.findByText(/must be clean before check-in/);
  expect(
    dialog.queryByRole("button", { name: "Confirm check-in" }),
  ).not.toBeInTheDocument();
  expect(write).not.toHaveBeenCalled();
  expect(dialog.queryByRole("checkbox")).not.toBeInTheDocument();
});
it("reviews the clean room and balance before a separate single arrival confirmation", async () => {
  ready = "CLEAN";
  mount();
  const dialog = await open("Check in guest");
  await userEvent.click(dialog.getByRole("button", { name: "Review action" }));
  const confirm = await dialog.findByRole("button", {
    name: "Confirm check-in",
  });
  expect(write).not.toHaveBeenCalled();
  await userEvent.dblClick(confirm);
  await screen.findByText(/Stay action confirmed/);
  expect(write).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledWith(42, { kind: "CHECK_IN" }, 0, 3);
});
it("requires explicit acknowledgement of outstanding funds before checkout and records no payment", async () => {
  record = {
    ...record,
    phase: "CHECKED_IN",
    startDate: "2026-11-06",
    endDate: "2026-11-07",
    checkedInAt: "2026-11-06T10:00:00.000001Z",
  };
  mount();
  const dialog = await open("Check out guest");
  await userEvent.click(dialog.getByRole("button", { name: "Review action" }));
  await dialog.findByText(/Acknowledge the outstanding balance/);
  expect(write).not.toHaveBeenCalled();
  await userEvent.click(dialog.getByRole("checkbox"));
  await userEvent.click(dialog.getByRole("button", { name: "Review action" }));
  await userEvent.click(
    await dialog.findByRole("button", { name: "Confirm checkout" }),
  );
  await waitFor(() =>
    expect(write).toHaveBeenCalledWith(
      42,
      { kind: "CHECK_OUT", acknowledgeBalance: true, reason: "" },
      0,
      undefined,
    ),
  );
  expect(
    api.mock.calls.some(
      ([url, init]) =>
        String(url).endsWith("/ledger/payments") && init?.method === "POST",
    ),
  ).toBe(false);
});
it("disables no-show on arrival day and requires a reason and review after that day", async () => {
  mount();
  expect(
    await screen.findByRole("button", { name: "Record no-show" }),
  ).toBeDisabled();
  record = { ...record, startDate: "2026-11-06", version: 1 };
  await act(async () => {
    cache.setQueryData(["reservations", 42], record);
    await cache.invalidateQueries({ queryKey: ["ledger", 42] });
  });
  const dialog = await open("Record no-show");
  await userEvent.click(dialog.getByRole("button", { name: "Review action" }));
  await dialog.findByText(/Enter a reason/);
  await userEvent.type(
    dialog.getByLabelText("Reason"),
    "Synthetic absent arrival",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Review action" }));
  expect(write).not.toHaveBeenCalled();
  expect(
    await dialog.findByRole("button", { name: "Confirm no-show" }),
  ).toBeEnabled();
});
it("keeps entered reasons and the reviewed version until an explicit reload", async () => {
  mount();
  const dialog = await open("Cancel reservation");
  await userEvent.type(
    dialog.getByLabelText("Reason"),
    "Synthetic changed plans",
  );
  record = { ...record, version: 1 };
  await userEvent.click(dialog.getByRole("button", { name: "Review action" }));
  await dialog.findByText(/The stay changed/);
  expect(write).not.toHaveBeenCalled();
  await userEvent.click(
    dialog.getByRole("button", { name: "Load current stay" }),
  );
  await waitFor(() =>
    expect(dialog.getByRole("button", { name: "Review action" })).toBeEnabled(),
  );
  expect(dialog.getByLabelText("Reason")).toHaveValue(
    "Synthetic changed plans",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Review action" }));
  await userEvent.click(
    await dialog.findByRole("button", { name: "Confirm cancellation" }),
  );
  await waitFor(() =>
    expect(write).toHaveBeenCalledWith(
      42,
      { kind: "CANCEL", reason: "Synthetic changed plans" },
      1,
      undefined,
    ),
  );
});
it("retains microseconds in both correction fields and requires an explicit repeated-time offset", async () => {
  record = {
    ...record,
    startDate: "2026-10-24",
    endDate: "2026-10-25",
    phase: "CHECKED_OUT",
    checkedInAt: "2026-10-24T10:00:00.123456Z",
    checkedOutAt: "2026-10-25T01:00:00.000001Z",
  };
  options.set("2026-10-25T02:30:00.000001", [
    { utc: "2026-10-25T00:30:00.000001Z", offset: "+02:00" },
    { utc: "2026-10-25T01:30:00.000001Z", offset: "+01:00" },
  ]);
  mount();
  const dialog = await open("Correct actual times");
  expect(dialog.getByLabelText("Actual arrival time")).toHaveValue(
    "12:00:00.123456",
  );
  expect(dialog.getByLabelText("Actual departure time")).toHaveValue(
    "02:00:00.000001",
  );
  await userEvent.clear(dialog.getByLabelText("Actual departure time"));
  await userEvent.type(
    dialog.getByLabelText("Actual departure time"),
    "02:30:00.000001",
  );
  await userEvent.type(
    dialog.getByLabelText("Reason"),
    "Synthetic corrected departure",
  );
  await userEvent.click(
    dialog.getByRole("button", { name: "Resolve property times" }),
  );
  const select = await dialog.findByLabelText("Departure UTC offset");
  expect(select).toHaveValue("");
  await userEvent.click(dialog.getByRole("button", { name: "Review action" }));
  await dialog.findByText(/choose an offset/);
  expect(write).not.toHaveBeenCalled();
  await userEvent.selectOptions(select, "2026-10-25T01:30:00.000001Z");
  await userEvent.click(dialog.getByRole("button", { name: "Review action" }));
  expect(
    await dialog.findByRole("button", { name: "Confirm time correction" }),
  ).toBeEnabled();
});
it("keeps offline actions disabled and never submits when connectivity returns", async () => {
  ready = "CLEAN";
  let online = false;
  const getter = vi
    .spyOn(navigator, "onLine", "get")
    .mockImplementation(() => online);
  try {
    mount();
    const button = await screen.findByRole("button", {
      name: "Check in guest",
    });
    expect(button).toBeDisabled();
    online = true;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(button).toBeEnabled());
    expect(write).not.toHaveBeenCalled();
  } finally {
    getter.mockRestore();
  }
});
it("keeps terminal stays read-only while exposing original-operation recovery", async () => {
  record = { ...record, phase: "NO_SHOW", status: "CANCELLED" };
  mount();
  expect(
    await screen.findByText("No-show", { exact: true }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Cancel reservation" }),
  ).not.toBeInTheDocument();
  const dialog = await open("Check previous stay action");
  await userEvent.selectOptions(
    dialog.getByLabelText("Previous stay action"),
    "CHECK_IN",
  );
  await userEvent.click(
    dialog.getByRole("button", { name: "Check previous save" }),
  );
  await waitFor(() =>
    expect(write).toHaveBeenCalledWith(
      42,
      { kind: "CHECK_IN" },
      0,
      undefined,
      true,
    ),
  );
  expect(
    dialog.queryByRole("button", { name: "Review action" }),
  ).not.toBeInTheDocument();
});
