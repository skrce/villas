import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { refreshSession } from "../../api/session";
import { testQuote, TEST_QUOTE_ID } from "../../test/quotes";

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const input = {
  roomId: 7,
  startDate: "2030-01-01",
  endDate: "2030-01-03",
  guestCount: 2,
};
const guest = {
  id: 5,
  firstName: "Walk",
  lastName: "In",
  active: true,
  version: 0,
};
const room = {
  id: 7,
  name: "Garden studio",
  reference: "GARDEN-1",
  capacity: 4,
  active: true,
  version: 0,
};
const path = (url: RequestInfo | URL) =>
  new URL(String(url), "http://localhost").pathname;
const body = (init?: RequestInit) => JSON.parse(String(init?.body ?? "{}"));
const api = vi.fn<typeof fetch>();
let offers: Map<string, ReturnType<typeof testQuote>>;
let saved: Record<string, unknown> | undefined;
let operation: Record<string, unknown> | undefined;
let generation: string;
const calls = (route: string, method: string) =>
  api.mock.calls.filter(
    ([url, init]) => path(url) === route && (init?.method ?? "GET") === method,
  );
async function responses(
  url: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const route = path(url);
  if (route === "/api/v1/auth/session")
    return json({
      authenticated: true,
      generation,
      staff: {
        id: "quote-owner",
        email: "owner@example.test",
        role: "OWNER",
        active: true,
        version: 0,
      },
      csrfToken: "quote-csrf",
      expiresAt: "2099-01-01T00:00:00Z",
      permissions: ["staff:manage", "reservations:write"],
      provider: "synthetic",
    });
  if (route === "/api/v1/customers/5") return json(guest);
  if (route === "/api/v1/apartments") return json([room]);
  if (route === "/api/v1/reservations/available-apartments")
    return json(saved ? [] : [room]);
  if (route === "/api/v1/booking-quotes") {
    const offer = testQuote(body(init));
    offers.set(offer.id, offer);
    return json(offer);
  }
  if (route === "/api/v1/reservations/quoted") {
    const requested = body(init);
    saved = {
      id: 42,
      customerId: 5,
      roomId: requested.roomId,
      startDate: requested.startDate,
      endDate: requested.endDate,
      guestCount: requested.guestCount,
      version: 0,
      status: "ACTIVE",
      nights: 2,
      acceptedQuoteId: requested.quoteId,
    };
    operation = {
      key: new Headers(init?.headers).get("Idempotency-Key"),
      kind: "CREATE",
      resourceId: 42,
      reservation: saved,
    };
    return json(42);
  }
  if (route.startsWith("/api/v1/operations/"))
    return operation
      ? json(operation)
      : json({ code: "OPERATION_NOT_COMMITTED" }, 404);
  if (route === "/api/v1/reservations/42") return json(saved);
  if (route === "/api/v1/reservations/42/events")
    return json({ items: [], nextCursor: null });
  if (route === "/api/v1/reservations/42/price")
    return json({
      recorded: true,
      price: {
        reservationId: 42,
        reservationVersion: 0,
        acceptedAt: new Date().toISOString(),
        quote: offers.get(String(saved?.acceptedQuoteId)),
      },
    });
  if (route === "/api/v1/reservations/42/prices")
    return json({ items: [], nextCursor: null });
  return json({ code: "NOT_FOUND" }, 404);
}
beforeEach(async () => {
  offers = new Map();
  saved = undefined;
  operation = undefined;
  generation = "quote-login-one";
  localStorage.clear();
  sessionStorage.clear();
  api.mockReset();
  api.mockImplementation(responses);
  vi.stubGlobal("fetch", api);
  await refreshSession({ explicit: true });
});
afterEach(() => vi.unstubAllGlobals());
async function enter(recover = false) {
  window.history.replaceState({}, "", "/reservations/new?guest=5");
  await act(async () => {
    render(<App />);
  });
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Guest" })).toHaveValue(
      "Walk In",
    ),
  );
  await userEvent.clear(screen.getByLabelText("Check-in"));
  await userEvent.type(screen.getByLabelText("Check-in"), input.startDate);
  await userEvent.clear(screen.getByLabelText("Check-out"));
  await userEvent.type(screen.getByLabelText("Check-out"), input.endDate);
  await userEvent.clear(screen.getByLabelText("Guests"));
  await userEvent.type(screen.getByLabelText("Guests"), "2");
  if (recover)
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: "Include unavailable rooms for an interrupted save",
      }),
    );
  await userEvent.selectOptions(await screen.findByLabelText("Room"), "7");
}
async function review() {
  await userEvent.click(screen.getByRole("button", { name: "Review price" }));
  return screen.findByRole("button", { name: /Confirm reservation/ });
}
describe("reviewed quote booking workflow", () => {
  it("loads bounded price history with an exclusive version cursor and retains earlier agreements", async () => {
    const current = testQuote(input);
    const previous = testQuote(
      input,
      "22222222-2222-4222-8222-222222222222",
      4001,
    );
    const earliest = testQuote(
      input,
      "33333333-3333-4333-8333-333333333333",
      3001,
    );
    offers.set(current.id, current);
    saved = {
      id: 42,
      customerId: 5,
      ...input,
      status: "ACTIVE",
      version: 30,
      nights: 2,
      acceptedQuoteId: current.id,
    };
    const accepted = (
      version: number,
      quote: ReturnType<typeof testQuote>,
    ) => ({
      reservationId: 42,
      reservationVersion: version,
      acceptedAt: new Date().toISOString(),
      quote,
    });
    api.mockImplementation((url, init) => {
      if (path(url) === "/api/v1/reservations/42/price")
        return Promise.resolve(
          json({ recorded: true, price: accepted(30, current) }),
        );
      if (path(url) === "/api/v1/reservations/42/prices") {
        const cursor = new URL(
          String(url),
          "http://localhost",
        ).searchParams.get("beforeVersion");
        return Promise.resolve(
          json(
            cursor === "20"
              ? { items: [accepted(10, earliest)], nextCursor: null }
              : {
                  items: [accepted(30, current), accepted(20, previous)],
                  nextCursor: 20,
                },
          ),
        );
      }
      return responses(url, init);
    });
    window.history.replaceState({}, "", "/reservations/42");
    await act(async () => {
      render(<App />);
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Price history", exact: true }),
    );
    expect(
      await screen.findByText("Current agreement", { exact: true }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("€80.02", { exact: true })).toHaveLength(2);
    await userEvent.click(
      screen.getByRole("button", { name: "Load earlier prices" }),
    );
    expect(await screen.findAllByText("€60.02", { exact: true })).toHaveLength(
      2,
    );
    expect(calls("/api/v1/reservations/42/prices", "GET")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Load earlier prices" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Hide price history" }),
    );
    expect(
      screen.queryByRole("heading", { name: "Accepted price history" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    "missing items",
    "wrong reservation",
    "future agreement",
    "ascending versions",
    "wrong cursor",
    "negative cursor",
    "empty cursor",
  ])("rejects malformed financial history: %s", async (problem) => {
    const quote = testQuote(input);
    offers.set(quote.id, quote);
    saved = {
      id: 42,
      customerId: 5,
      ...input,
      status: "ACTIVE",
      version: 3,
      nights: 2,
      acceptedQuoteId: quote.id,
    };
    const accepted = {
      reservationId: 42,
      reservationVersion: 0,
      acceptedAt: new Date().toISOString(),
      quote,
    };
    let value: unknown = { items: [accepted], nextCursor: null };
    if (problem === "missing items") value = {};
    if (problem === "wrong reservation")
      value = { items: [{ ...accepted, reservationId: 99 }] };
    if (problem === "future agreement")
      value = { items: [{ ...accepted, reservationVersion: 4 }] };
    if (problem === "ascending versions")
      value = { items: [accepted, { ...accepted, reservationVersion: 1 }] };
    if (problem === "wrong cursor")
      value = { items: [accepted], nextCursor: 2 };
    if (problem === "negative cursor")
      value = { items: [accepted], nextCursor: -1 };
    if (problem === "empty cursor") value = { items: [], nextCursor: 0 };
    api.mockImplementation((url, init) =>
      path(url) === "/api/v1/reservations/42/prices"
        ? Promise.resolve(json(value))
        : responses(url, init),
    );
    window.history.replaceState({}, "", "/reservations/42");
    await act(async () => {
      render(<App />);
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Price history", exact: true }),
    );
    const history = (
      await screen.findByRole("heading", { name: "Accepted price history" })
    ).closest("section")!;
    await within(history).findByText(/These records could not be loaded/);
    expect(
      within(history).queryByText("Total accommodation"),
    ).not.toBeInTheDocument();
  });

  it("does not report an explicitly priced reservation as unpriced after a malformed success", async () => {
    api.mockImplementation((url, init) =>
      path(url) === "/api/v1/reservations/42/price"
        ? Promise.resolve(json({ recorded: false, price: null }))
        : responses(url, init),
    );
    await enter();
    await userEvent.click(await review());
    const panel = (
      await screen.findByRole("heading", { name: "Agreed accommodation price" })
    ).closest("section")!;
    await within(panel).findByText(/These records could not be loaded/);
    expect(
      within(panel).queryByText("Price not recorded"),
    ).not.toBeInTheDocument();
  });

  it("does not adopt a late refreshed offer into a recovered Owner session", async () => {
    let finish: (response: Response) => void = () => {};
    let offered = 0;
    api.mockImplementation((url, init) => {
      if (path(url) === "/api/v1/booking-quotes") {
        offered++;
        const next = testQuote(
          body(init),
          offered === 1
            ? TEST_QUOTE_ID
            : "22222222-2222-4222-8222-222222222222",
          offered === 1 ? 5001 : 7001,
          offered,
        );
        offers.set(next.id, next);
        return Promise.resolve(json(next));
      }
      if (path(url) === "/api/v1/reservations/quoted")
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      return responses(url, init);
    });
    await enter();
    await userEvent.click(await review());
    generation = "quote-fresh-session";
    await act(async () => {
      await refreshSession({ explicit: true });
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Review price" }),
      ).toBeEnabled(),
    );
    const current = await review();
    expect(current).toHaveTextContent("€140.02");
    const oldReplacement = testQuote(
      input,
      "33333333-3333-4333-8333-333333333333",
      9001,
      3,
    );
    await act(async () => {
      finish(
        json({ code: "QUOTE_CHANGED", replacementQuote: oldReplacement }, 409),
      );
    });
    expect(
      screen.getByRole("button", { name: "Confirm reservation · €140.02" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/The quote was refreshed/),
    ).not.toBeInTheDocument();
    expect(calls("/api/v1/reservations/quoted", "POST")).toHaveLength(1);
  });

  it("never displays another quote as the booking's accepted price", async () => {
    api.mockImplementation((url, init) => {
      if (path(url) === "/api/v1/reservations/42/price")
        return Promise.resolve(
          json({
            recorded: true,
            price: {
              reservationId: 42,
              reservationVersion: 0,
              acceptedAt: new Date().toISOString(),
              quote: testQuote(
                input,
                "33333333-3333-4333-8333-333333333333",
                9001,
              ),
            },
          }),
        );
      return responses(url, init);
    });
    await enter();
    await userEvent.click(await review());
    const heading = await screen.findByRole("heading", {
      name: "Agreed accommodation price",
    });
    const panel = heading.closest("section")!;
    await within(panel).findByText(/These records could not be loaded/);
    expect(
      within(panel).queryByText("Total accommodation"),
    ).not.toBeInTheDocument();
    expect(panel).not.toHaveTextContent("€180.02");
  });

  it("shows the exact price first and only confirms after an explicit second action", async () => {
    await enter();
    const confirm = await review();
    expect(calls("/api/v1/reservations/quoted", "POST")).toHaveLength(0);
    expect(confirm).toHaveTextContent("€100.02");
    expect(
      screen.getByRole("region", { name: "Reviewed accommodation price" }),
    ).toHaveTextContent("2 nights × €50.01");
    await userEvent.click(confirm);
    await screen.findByRole("heading", { name: "Agreed accommodation price" });
    expect(calls("/api/v1/reservations/quoted", "POST")).toHaveLength(1);
    expect(
      body(calls("/api/v1/reservations/quoted", "POST")[0][1]),
    ).toMatchObject({ ...input, customerId: 5, quoteId: TEST_QUOTE_ID });
    expect(JSON.stringify(localStorage)).not.toContain("10002");
    expect(JSON.stringify(sessionStorage)).not.toContain(input.startDate);
  });
  it("returns missing rates to configuration without inventing a free quote", async () => {
    api.mockImplementation((url, init) =>
      path(url) === "/api/v1/booking-quotes"
        ? Promise.resolve(json({ code: "RATES_REQUIRED" }, 409))
        : responses(url, init),
    );
    await enter();
    await userEvent.click(screen.getByRole("button", { name: "Review price" }));
    expect(
      await screen.findByRole("link", { name: "Configure this room's rates" }),
    ).toHaveAttribute("href", "/rooms/7#rates");
    expect(
      screen.queryByRole("button", { name: /Confirm reservation/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Check-in")).toHaveValue(input.startDate);
    expect(calls("/api/v1/reservations/quoted", "POST")).toHaveLength(0);
  });
  it("requires a second explicit confirmation of a refreshed price without losing guest or dates", async () => {
    let changed = false;
    api.mockImplementation((url, init) => {
      if (path(url) === "/api/v1/reservations/quoted" && !changed) {
        changed = true;
        const fresh = testQuote(
          input,
          "22222222-2222-4222-8222-222222222222",
          6001,
          2,
        );
        offers.set(fresh.id, fresh);
        return Promise.resolve(
          json({ code: "QUOTE_CHANGED", replacementQuote: fresh }, 409),
        );
      }
      return responses(url, init);
    });
    await enter();
    await userEvent.click(await review());
    const next = await screen.findByRole("button", {
      name: "Confirm reservation · €120.02",
    });
    expect(calls("/api/v1/reservations/quoted", "POST")).toHaveLength(1);
    expect(screen.getByRole("combobox", { name: "Guest" })).toHaveValue(
      "Walk In",
    );
    expect(screen.getByLabelText("Check-in")).toHaveValue(input.startDate);
    await userEvent.click(next);
    await screen.findByRole("heading", { name: "Agreed accommodation price" });
    expect(calls("/api/v1/reservations/quoted", "POST")).toHaveLength(2);
    expect(
      body(calls("/api/v1/reservations/quoted", "POST")[1][1]).quoteId,
    ).toBe("22222222-2222-4222-8222-222222222222");
  });
  it("discards a delayed quote when the entered stay changes while it loads", async () => {
    let finish: (response: Response) => void = () => {};
    api.mockImplementation((url, init) =>
      path(url) === "/api/v1/booking-quotes"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : responses(url, init),
    );
    await enter();
    await userEvent.click(screen.getByRole("button", { name: "Review price" }));
    await userEvent.clear(screen.getByLabelText("Check-out"));
    await userEvent.type(screen.getByLabelText("Check-out"), "2030-01-04");
    await act(async () => {
      finish(json(testQuote(input)));
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Review price" }),
      ).toBeEnabled(),
    );
    expect(
      screen.queryByRole("region", { name: "Reviewed accommodation price" }),
    ).not.toBeInTheDocument();
    expect(calls("/api/v1/reservations/quoted", "POST")).toHaveLength(0);
  });
  it("recovers a saved booking after reload with its original quote and without fetching another offer", async () => {
    let lose = true;
    api.mockImplementation(async (url, init) => {
      const result = await responses(url, init);
      if (path(url) === "/api/v1/reservations/quoted" && lose) {
        lose = false;
        throw new TypeError("Lost confirmation response");
      }
      return result;
    });
    await enter();
    await userEvent.click(await review());
    await screen.findByText(/The result could not be confirmed/);
    expect(
      sessionStorage.getItem("villarosa.ownPendingOperations.v2"),
    ).toContain(TEST_QUOTE_ID);
    cleanup();
    await enter(true);
    await userEvent.click(
      screen.getByRole("button", { name: "Check previous save" }),
    );
    await screen.findByRole("heading", { name: "Agreed accommodation price" });
    expect(calls("/api/v1/booking-quotes", "POST")).toHaveLength(1);
    expect(calls("/api/v1/reservations/quoted", "POST")).toHaveLength(1);
  });
  it("does not expose confirmation for an inconsistent successful quote body", async () => {
    api.mockImplementation((url, init) =>
      path(url) === "/api/v1/booking-quotes"
        ? Promise.resolve(
            json({
              ...testQuote(input),
              price: { ...testQuote(input).price, totalCents: 1 },
            }),
          )
        : responses(url, init),
    );
    await enter();
    await userEvent.click(screen.getByRole("button", { name: "Review price" }));
    await screen.findByText(/The result could not be confirmed/);
    expect(
      screen.queryByRole("button", { name: /Confirm reservation/ }),
    ).not.toBeInTheDocument();
  });
  it("keeps reviewed fields fixed while confirmation is in progress", async () => {
    let finish: (response: Response) => void = () => {};
    api.mockImplementation((url, init) =>
      path(url) === "/api/v1/reservations/quoted"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : responses(url, init),
    );
    await enter();
    await userEvent.click(await review());
    expect(screen.getByLabelText("Check-in")).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Guest" })).toBeDisabled();
    expect(screen.getByLabelText("Room")).toBeDisabled();
    await act(async () => {
      finish(json({ code: "INVENTORY_CONFLICT" }, 409));
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Check-in")).toBeEnabled(),
    );
  });
  it("keeps a late offer out of a recovered Owner session and never submits automatically", async () => {
    let finish: (response: Response) => void = () => {};
    api.mockImplementation((url, init) =>
      path(url) === "/api/v1/booking-quotes"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : responses(url, init),
    );
    await enter();
    await userEvent.click(screen.getByRole("button", { name: "Review price" }));
    generation = "quote-login-two";
    await act(async () => {
      await refreshSession({ explicit: true });
    });
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Guest" })).toHaveValue(
        "Walk In",
      ),
    );
    await act(async () => {
      finish(json(testQuote(input)));
    });
    expect(
      screen.queryByRole("region", { name: "Reviewed accommodation price" }),
    ).not.toBeInTheDocument();
    expect(calls("/api/v1/reservations/quoted", "POST")).toHaveLength(0);
  });
});
