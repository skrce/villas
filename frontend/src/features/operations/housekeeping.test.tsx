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
  ReservationApi,
} from "../../api/generated";
import { getSessionEpoch } from "../../api/session";
import { DraftContext, WorkspaceContext } from "../../app/context";
import { Housekeeping, RoomReadinessPanel } from "./Housekeeping";
import type { ReadinessState } from "../../shared/operations";

const actor = "00000000-0000-0000-0000-000000000001";
const api = vi.fn<typeof fetch>();
const write = vi.fn();
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
let cache: QueryClient;
let drafts: Map<string, unknown>;
let state: ReadinessState;
let version: number;
const room = () => ({
  roomId: 7,
  name: "Synthetic review room",
  reference: "ROOM-7",
  occupied: false,
  maintenance: [],
  readiness: {
    roomId: 7,
    state,
    version,
    changedAt: "2026-11-07T01:00:00.123456Z",
  },
});
function mount(path = "/housekeeping", panel = false) {
  cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const config = new Configuration({ basePath: "/api/v1", fetchApi: api });
  const reservationApi = new ReservationApi(config);
  const operationsApi = new OperationsApi(config);
  const epoch = getSessionEpoch();
  const context = {
    apis: { ...buildApis(actor, epoch), reservationApi, operationsApi },
    businessId: "villa-rosa",
    businessName: "Synthetic business",
    ownerId: actor,
    epoch,
    booking: {
      ...buildBookingActions(reservationApi, "readiness-review"),
      changeReadiness: write,
    },
  };
  return render(
    <QueryClientProvider client={cache}>
      <WorkspaceContext.Provider value={context}>
        <DraftContext.Provider value={drafts}>
          <MemoryRouter initialEntries={[path]}>
            {panel ? (
              <RoomReadinessPanel
                roomId={7}
                name="Synthetic review room"
                reference="ROOM-7"
              />
            ) : (
              <Housekeeping />
            )}
          </MemoryRouter>
        </DraftContext.Provider>
      </WorkspaceContext.Provider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  drafts = new Map();
  state = "IN_PROGRESS";
  version = 1;
  api.mockReset();
  write.mockReset();
  write.mockResolvedValue({});
  api.mockImplementation(async (input) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname.endsWith("/housekeeping"))
      return json({
        propertyDate: "2026-11-07",
        maintenanceUntil: "2026-11-14",
        rooms:
          !url.searchParams.get("state") ||
          url.searchParams.get("state") === state
            ? [room()]
            : [],
        nextCursor: null,
      });
    if (url.pathname.endsWith("/events"))
      return json({ items: [], nextCursor: null });
    return json(room().readiness);
  });
});
afterEach(() => {
  cleanup();
  cache?.clear();
});

it("reloads a concurrent room state that leaves the filtered board before a valid dirty reset", async () => {
  mount("/housekeeping?state=IN_PROGRESS");
  await userEvent.click(
    await screen.findByRole("button", { name: "Mark dirty" }),
  );
  const form = within(screen.getByRole("dialog"));
  await userEvent.type(
    form.getByLabelText("Reason"),
    "Synthetic inspection failed",
  );
  state = "INSPECTION";
  version = 2;
  await act(async () => {
    await cache.invalidateQueries();
  });
  await screen.findByText("No rooms match");
  await userEvent.click(
    form.getByRole("button", { name: "Load current state" }),
  );
  await waitFor(() =>
    expect(
      form.getByRole("button", { name: "Load current state" }),
    ).toBeEnabled(),
  );
  expect(
    cache.getQueryData<{ version: number }>(["room-readiness", 7])?.version,
  ).toBe(2);
  expect(form.getByRole("button", { name: "Confirm readiness" })).toBeEnabled();
});

it("keeps each recovery target reason separate and cannot submit a new write from archived room recovery", async () => {
  mount("/rooms/7", true);
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Check previous readiness save",
    }),
  );
  let form = within(screen.getByRole("dialog"));
  await userEvent.type(
    form.getByLabelText("Reason, optional"),
    "Synthetic started cleaning",
  );
  await userEvent.selectOptions(
    form.getByLabelText("Previous target state"),
    "DIRTY",
  );
  form = within(screen.getByRole("dialog"));
  expect(form.getByLabelText("Reason")).toHaveValue("");
  await userEvent.type(
    form.getByLabelText("Reason"),
    "Synthetic failed inspection",
  );
  await userEvent.selectOptions(
    form.getByLabelText("Previous target state"),
    "IN_PROGRESS",
  );
  form = within(screen.getByRole("dialog"));
  expect(form.getByLabelText("Reason, optional")).toHaveValue(
    "Synthetic started cleaning",
  );
  expect(
    form.queryByRole("button", { name: "Confirm readiness" }),
  ).not.toBeInTheDocument();
  expect(
    form.queryByRole("button", { name: "Load current state" }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    form.getByRole("button", { name: "Check previous save" }),
  );
  await waitFor(() =>
    expect(write).toHaveBeenCalledWith(
      7,
      "IN_PROGRESS",
      "Synthetic started cleaning",
      1,
      true,
    ),
  );
});

it("retains the original reviewed version until an explicit current-state read", async () => {
  state = "INSPECTION";
  version = 2;
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Mark clean" }),
  );
  let form = within(screen.getByRole("dialog"));
  await userEvent.type(
    form.getByLabelText("Reason, optional"),
    "Synthetic inspection note",
  );
  await userEvent.click(form.getByRole("button", { name: "Close dialog" }));
  version = 6;
  await act(async () => {
    await cache.invalidateQueries();
  });
  await userEvent.click(
    await screen.findByRole("button", { name: "Mark clean" }),
  );
  form = within(screen.getByRole("dialog"));
  expect(form.getByLabelText("Reason, optional")).toHaveValue(
    "Synthetic inspection note",
  );
  expect(
    form.getByRole("button", { name: "Confirm readiness" }),
  ).toBeDisabled();
  await userEvent.click(
    form.getByRole("button", { name: "Load current state" }),
  );
  await waitFor(() =>
    expect(
      form.getByRole("button", { name: "Confirm readiness" }),
    ).toBeEnabled(),
  );
  await userEvent.click(
    form.getByRole("button", { name: "Confirm readiness" }),
  );
  await waitFor(() =>
    expect(write).toHaveBeenCalledWith(
      7,
      "CLEAN",
      "Synthetic inspection note",
      6,
      false,
    ),
  );
});
