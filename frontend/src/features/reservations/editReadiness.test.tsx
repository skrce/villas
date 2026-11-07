import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { EditReservation } from "./Edit";
import { DraftContext, WorkspaceContext } from "../../app/context";
import { buildApis } from "../../api/client";
import { buildBookingActions } from "../../api/bookingActions";
import {
  Configuration,
  OperationsApi,
  QuotesApi,
  ReservationApi,
  ResponseError,
} from "../../api/generated";
import { getSessionEpoch } from "../../api/session";
import { testQuote } from "../../test/quotes";
const actor = "00000000-0000-0000-0000-000000000001";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
let cache: QueryClient;
afterEach(() => {
  cleanup();
  cache?.clear();
});
it("preserves clean destination proof when an in-house move receives a replacement quote", async () => {
  const requested = {
    roomId: 8,
    startDate: "2026-11-06",
    endDate: "2026-11-09",
    guestCount: 2,
  };
  const first = testQuote(
    requested,
    "11111111-1111-4111-8111-111111111111",
    5001,
  );
  const fresh = testQuote(
    requested,
    "22222222-2222-4222-8222-222222222222",
    6001,
    2,
  );
  const api = vi
    .fn<typeof fetch>()
    .mockImplementation(async (input) =>
      String(input).endsWith("/readiness")
        ? json({
            roomId: 8,
            state: "CLEAN",
            version: 3,
            changedAt: "2026-11-07T09:00:00Z",
          })
        : json(first),
    );
  const config = new Configuration({ basePath: "/api/v1", fetchApi: api });
  const reservationApi = new ReservationApi(config);
  const edit = vi
    .fn()
    .mockRejectedValueOnce(
      new ResponseError(
        json({ code: "QUOTE_CHANGED", replacementQuote: fresh }, 409),
        "Changed",
      ),
    );
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const epoch = getSessionEpoch();
  const context = {
    apis: {
      ...buildApis(actor, epoch),
      reservationApi,
      operationsApi: new OperationsApi(config),
      quotesApi: new QuotesApi(config),
    },
    ownerId: actor,
    epoch,
    booking: {
      ...buildBookingActions(reservationApi, "stay-review"),
      editStay: edit,
    },
  };
  render(
    <MemoryRouter>
      <QueryClientProvider client={cache}>
        <WorkspaceContext.Provider value={context}>
          <DraftContext.Provider value={new Map()}>
            <EditReservation
              kind="move"
              reservationId={42}
              expectedVersion={1}
              currentVersion={1}
              operational
              draftKey="probe-move"
              record={{
                roomId: 7,
                startDate: requested.startDate,
                endDate: requested.endDate,
                guestCount: 2,
                phase: "CHECKED_IN",
              }}
              rooms={[
                { id: 7, capacity: 4, active: true },
                { id: 8, capacity: 4, active: true },
              ]}
              onSubmit={async () => {}}
              onSaved={() => {}}
              onBusy={() => {}}
              busy={false}
              message=""
            />
          </DraftContext.Provider>
        </WorkspaceContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  await userEvent.selectOptions(screen.getByLabelText("New room"), "8");
  await userEvent.type(screen.getByLabelText("Reason"), "Synthetic room move");
  await userEvent.click(screen.getByRole("button", { name: "Review price" }));
  await userEvent.click(
    await screen.findByRole("button", { name: "Confirm changes · €150.03" }),
  );
  await screen.findByText(/quote was refreshed/);
  await userEvent.click(
    await screen.findByRole("button", { name: "Confirm changes · €180.03" }),
  );
  await waitFor(() => expect(edit).toHaveBeenCalledTimes(2));
  expect(edit.mock.calls[0][5]).toBe(3);
  expect(edit.mock.calls[1][5]).toBe(3);
});
