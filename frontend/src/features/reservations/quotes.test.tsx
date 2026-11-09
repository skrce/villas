import { sessionFixture, scopedPath } from "../../test/session";
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
let agreements: {
  reservationId: number;
  reservationVersion: number;
  acceptedAt: string;
  quote: ReturnType<typeof testQuote>;
}[];
const allRooms = [
  room,
  { ...room, id: 8, name: "Lake annex", reference: "ANNEX-2" },
];
const rememberPrice = () =>
  agreements.push({
    reservationId: 42,
    reservationVersion: Number(saved!.version),
    acceptedAt: new Date().toISOString(),
    quote: offers.get(String(saved!.acceptedQuoteId))!,
  });
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
    return json(
      sessionFixture({
        authenticated: true,
        propertyId: "villa-rosa",
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
      }),
    );
  if (route === "/api/v1/customers/5") return json(guest);
  if (route === "/api/v1/apartments") return json(allRooms);
  if (route === "/api/v1/reservations/available-apartments")
    return json(saved ? [] : allRooms);
  if (route === "/api/v1/booking-quotes") {
    const offer = testQuote(
      body(init),
      offers.size ? crypto.randomUUID() : TEST_QUOTE_ID,
      body(init).roomId === 8 ? 6001 : 5001,
    );
    offers.set(offer.id, offer);
    return json(offer);
  }
  if (route.startsWith("/api/v1/booking-quotes/"))
    return offers.has(route.split("/").pop()!)
      ? json(offers.get(route.split("/").pop()!))
      : json({ code: "NOT_FOUND" }, 404);
  if (
    ["/api/v1/reservations/42/change", "/api/v1/reservations/42/move"].includes(
      route,
    ) &&
    init?.method === "POST"
  ) {
    const requested = body(init);
    if (requested.expectedVersion !== saved?.version)
      return json({ code: "STALE_VERSION" }, 409);
    const moving = route.endsWith("/move");
    saved = {
      ...saved,
      ...(moving
        ? { roomId: requested.roomId }
        : {
            startDate: requested.startDate,
            endDate: requested.endDate,
            guestCount: requested.guestCount,
          }),
      version: Number(saved!.version) + 1,
      acceptedQuoteId: requested.quoteId,
    };
    rememberPrice();
    operation = {
      key: new Headers(init.headers).get("Idempotency-Key"),
      kind: moving ? "MOVE" : "CHANGE",
      resourceId: 42,
      reservation: saved,
      inventoryEvent: {
        id: "9007199254741001",
        actorId: "quote-owner",
        operationKey: new Headers(init.headers).get("Idempotency-Key"),
        kind: moving ? "MOVED" : "CHANGED",
        resourceVersion: saved.version,
        roomId: saved.roomId,
        startDate: saved.startDate,
        endDate: saved.endDate,
        guestCount: saved.guestCount,
        phase: saved.phase,
        reason: requested.reason,
        occurredAt: new Date().toISOString(),
      },
    };
    return json(saved);
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
      phase: "CONFIRMED",
      nights: 2,
      acceptedQuoteId: requested.quoteId,
    };
    operation = {
      key: new Headers(init?.headers).get("Idempotency-Key"),
      kind: "CREATE",
      resourceId: 42,
      reservation: saved,
    };
    rememberPrice();
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
      price: agreements.find(
        (value) => value.quote.id === saved?.acceptedQuoteId,
      ) ?? {
        reservationId: 42,
        reservationVersion: 0,
        acceptedAt: new Date().toISOString(),
        quote: offers.get(String(saved?.acceptedQuoteId)),
      },
    });
  if (route === "/api/v1/reservations/42/prices")
    return json({ items: [...agreements].reverse(), nextCursor: null });
  return json({ code: "NOT_FOUND" }, 404);
}
beforeEach(async () => {
  offers = new Map();
  agreements = [];
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
  window.history.replaceState({}, "", scopedPath("/reservations/new?guest=5"));
  await act(async () => {
    render(<App />);
  });
  await userEvent.click(
    await screen.findByRole("button", { name: "Show all steps" }),
  );
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

async function wizard() {
  window.history.replaceState({}, "", scopedPath("/reservations/new?guest=5"));
  await act(async () => {
    render(<App />);
  });
  await screen.findByRole("heading", { name: "1. Stay details" });
  await userEvent.clear(screen.getByLabelText("Check-in"));
  await userEvent.type(screen.getByLabelText("Check-in"), input.startDate);
  await userEvent.clear(screen.getByLabelText("Check-out"));
  await userEvent.type(screen.getByLabelText("Check-out"), input.endDate);
  await userEvent.clear(screen.getByLabelText("Guests"));
  await userEvent.type(screen.getByLabelText("Guests"), "2");
  await userEvent.click(
    screen.getByRole("button", { name: "Continue to room & guest" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Guest" })).toHaveValue(
      "Walk In",
    ),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: /Garden studio.*Choose room/ }),
  );
}

describe("guided booking steps", () => {
  it("recovers a lost collapsed-wizard confirmation after same-Owner reauthentication without reviewing another quote", async () => {
    let lost = true;
    api.mockImplementation(async (url, init) => {
      const result = await responses(url, init);
      if (path(url) === "/api/v1/reservations/quoted" && lost) {
        lost = false;
        throw new TypeError("Lost confirmation response");
      }
      return result;
    });
    await wizard();
    await userEvent.click(await review());
    await screen.findByText(/The result could not be confirmed/);
    generation = "wizard-unknown-recovered-session";
    await act(async () => {
      await refreshSession({ explicit: true });
    });
    await screen.findByRole("heading", { name: "3. Review & confirm" });
    expect(
      screen.queryByRole("button", { name: /Confirm reservation/ }),
    ).not.toBeInTheDocument();
    const offersBefore = calls("/api/v1/booking-quotes", "POST").length;
    await userEvent.click(
      screen.getByRole("button", { name: "Check previous save" }),
    );
    await screen.findByRole("heading", { name: "Agreed accommodation price" });
    expect(calls("/api/v1/booking-quotes", "POST")).toHaveLength(offersBefore);
    expect(calls("/api/v1/reservations/quoted", "POST")).toHaveLength(1);
    expect(sessionStorage.getItem("villarosa.ownPendingOperations.v2")).toBe(
      "{}",
    );
  });

  it("does not advance the wizard with an offer for a guest choice that changed while the quote loaded", async () => {
    let finish: (result: Response) => void = () => {};
    api.mockImplementation((url, init) =>
      path(url) === "/api/v1/booking-quotes"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : responses(url, init),
    );
    await wizard();
    await userEvent.click(screen.getByRole("button", { name: "Review price" }));
    await userEvent.clear(screen.getByRole("combobox", { name: "Guest" }));
    await userEvent.type(
      screen.getByRole("combobox", { name: "Guest" }),
      "Another synthetic guest",
    );
    await act(async () => {
      finish(json(testQuote(input)));
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Review price" }),
      ).toBeEnabled(),
    );
    expect(
      screen.getByRole("heading", { name: "2. Choose room & guest" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Confirm reservation/ }),
    ).not.toBeInTheDocument();
    expect(calls("/api/v1/reservations/quoted", "POST")).toHaveLength(0);
  });

  it("keeps calendar intents separate during a held availability read and browser Back", async () => {
    let finish!: (response: Response) => void;
    api.mockImplementation((url, init) => {
      const u = new URL(String(url), "http://localhost");
      if (
        u.pathname.endsWith("/available-apartments") &&
        u.searchParams.get("startDate") === "2030-01-01"
      )
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      if (
        u.pathname.endsWith("/available-apartments") &&
        u.searchParams.get("startDate") === "2030-02-01"
      )
        return Promise.resolve(json([allRooms[1]]));
      return responses(url, init);
    });
    window.history.replaceState(
      {},
      "",
      scopedPath(
        "/reservations/new?guest=5&room=7&from=2030-01-01&to=2030-01-03",
      ),
    );
    await act(async () => {
      render(<App />);
    });
    await screen.findByRole("heading", { name: "1. Stay details" });
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    await userEvent.clear(screen.getByLabelText("Guests"));
    await userEvent.type(screen.getByLabelText("Guests"), "3");
    await act(async () => {
      window.history.pushState(
        {},
        "",
        scopedPath(
          "/reservations/new?guest=5&room=8&from=2030-02-01&to=2030-02-03",
        ),
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Check-in")).toHaveValue("2030-02-01"),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Continue to room & guest" }),
    );
    await screen.findByRole("button", { name: /Lake annex.*Selected/ });
    await act(async () => {
      finish(json([room]));
    });
    expect(
      screen.queryByRole("button", { name: /Garden studio.*Choose room/ }),
    ).not.toBeInTheDocument();
    await act(async () => {
      window.history.back();
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Check-in")).toHaveValue("2030-01-01"),
    );
    expect(screen.getByLabelText("Guests")).toHaveValue(3);
    expect(calls("/api/v1/reservations/quoted", "POST")).toHaveLength(0);
  });
  it("requires valid dates and capacity before moving to named room choices", async () => {
    window.history.replaceState({}, "", scopedPath("/reservations/new"));
    await act(async () => {
      render(<App />);
    });
    await screen.findByRole("heading", { name: "1. Stay details" });
    await userEvent.clear(screen.getByLabelText("Guests"));
    await userEvent.type(screen.getByLabelText("Guests"), "1001");
    await userEvent.click(
      screen.getByRole("button", { name: "Continue to room & guest" }),
    );
    expect(
      screen.getByRole("heading", { name: "1. Stay details" }),
    ).toHaveFocus();
    expect(
      screen.queryByRole("combobox", { name: "Guest" }),
    ).not.toBeInTheDocument();
    expect(calls("/api/v1/booking-quotes", "POST")).toHaveLength(0);
    expect(calls("/api/v1/reservations/quoted", "POST")).toHaveLength(0);
  });
  it("guides dates to room and guest, then focuses an explicit quote review before confirmation", async () => {
    await wizard();
    expect(
      screen.getByRole("heading", { name: "2. Choose room & guest" }),
    ).toBeInTheDocument();
    const confirm = await review();
    expect(
      screen.getByRole("heading", { name: "3. Review & confirm" }),
    ).toHaveFocus();
    expect(
      screen.getByRole("region", { name: "Booking review" }),
    ).toHaveTextContent("Walk In");
    expect(
      screen.getByRole("region", { name: "Booking review" }),
    ).toHaveTextContent("Garden studio");
    expect(calls("/api/v1/reservations/quoted", "POST")).toHaveLength(0);
    await userEvent.dblClick(confirm);
    await screen.findByRole("heading", { name: "Agreed accommodation price" });
    expect(calls("/api/v1/reservations/quoted", "POST")).toHaveLength(1);
  });
  it("returns a contested room to refreshed alternatives without losing guest or stay", async () => {
    let contested = false;
    api.mockImplementation((url, init) => {
      if (path(url) === "/api/v1/reservations/quoted" && !contested) {
        contested = true;
        return Promise.resolve(
          json(
            { code: "INVENTORY_CONFLICT", message: "The room is occupied." },
            409,
          ),
        );
      }
      if (
        path(url) === "/api/v1/reservations/available-apartments" &&
        contested
      )
        return Promise.resolve(json([allRooms[1]]));
      return responses(url, init);
    });
    await wizard();
    await userEvent.click(await review());
    await screen.findByText(/The selected room was taken or blocked/);
    expect(
      screen.getByRole("heading", { name: "2. Choose room & guest" }),
    ).toHaveFocus();
    expect(screen.getByRole("combobox", { name: "Guest" })).toHaveValue(
      "Walk In",
    );
    expect(screen.getByLabelText("Check-in")).toHaveValue(input.startDate);
    expect(
      screen.queryByRole("button", { name: /Confirm reservation/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole("button", { name: /Lake annex.*Choose room/ }),
    );
    await userEvent.click(await review());
    await screen.findByRole("heading", { name: "Agreed accommodation price" });
    expect(
      body(calls("/api/v1/reservations/quoted", "POST")[1][1]),
    ).toMatchObject({ ...input, roomId: 8, customerId: 5 });
  });
  it("retains the review step across same-Owner reauthentication and requires a new explicit offer", async () => {
    await wizard();
    await review();
    generation = "wizard-recovered-login";
    await act(async () => {
      await refreshSession({ explicit: true });
    });
    await screen.findByRole("heading", { name: "3. Review & confirm" });
    expect(
      screen.queryByRole("button", { name: /Confirm reservation/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Booking review" }),
    ).toHaveTextContent("Walk In");
    expect(calls("/api/v1/reservations/quoted", "POST")).toHaveLength(0);
    expect(calls("/api/v1/booking-quotes", "POST")).toHaveLength(1);
    await review();
    expect(calls("/api/v1/booking-quotes", "POST")).toHaveLength(2);
  });
  it("does not queue a confirmation while offline or automatically submit on reconnection", async () => {
    await wizard();
    const confirm = await review();
    let online = false;
    const getter = vi
      .spyOn(navigator, "onLine", "get")
      .mockImplementation(() => online);
    try {
      await act(async () => {
        window.dispatchEvent(new Event("offline"));
      });
      expect(confirm).toBeDisabled();
      expect(
        screen.getByText(/You're offline. Your draft is kept here/),
      ).toBeInTheDocument();
      online = true;
      await act(async () => {
        window.dispatchEvent(new Event("online"));
      });
      expect(confirm).toBeEnabled();
      expect(calls("/api/v1/reservations/quoted", "POST")).toHaveLength(0);
      await userEvent.click(confirm);
      await screen.findByRole("heading", {
        name: "Agreed accommodation price",
      });
      expect(calls("/api/v1/reservations/quoted", "POST")).toHaveLength(1);
    } finally {
      getter.mockRestore();
    }
  });
});

describe("reviewed quote booking workflow", () => {
  it.each(["stay", "move"] as const)(
    "keeps read-only edit recovery available after another Owner cancels a lost edit (%s)",
    async (kind) => {
      await booked();
      const target =
        kind === "stay"
          ? "/api/v1/reservations/42/change"
          : "/api/v1/reservations/42/move";
      let lose = true;
      api.mockImplementation(async (url, init) => {
        const response = await responses(url, init);
        if (path(url) === target && init?.method === "POST" && lose) {
          lose = false;
          throw new TypeError("Lost accepted edit response");
        }
        return response;
      });
      const dialog = await dialogFor(kind);
      if (kind === "stay") {
        await userEvent.clear(within(dialog).getByLabelText("Guests"));
        await userEvent.type(within(dialog).getByLabelText("Guests"), "3");
      } else
        await userEvent.selectOptions(
          within(dialog).getByLabelText("New room"),
          "8",
        );
      await userEvent.click(await editQuote(dialog));
      await within(dialog).findByText(/The result could not be confirmed/);
      expect(
        sessionStorage.getItem("villarosa.ownPendingOperations.v2"),
      ).not.toBe("{}");
      saved = { ...saved, status: "CANCELLED", phase: "CANCELLED", version: 2 };
      cleanup();
      window.history.replaceState({}, "", scopedPath("/reservations/42"));
      await act(async () => {
        render(<App />);
      });
      await screen.findAllByText("Cancelled", { exact: true });
      await userEvent.click(
        screen.getByRole("button", { name: "Check previous booking edit" }),
      );
      const recovery = screen.getByRole("dialog", {
        name: "Check previous save",
      });
      if (kind === "move") {
        await userEvent.selectOptions(
          within(recovery).getByLabelText("Previous change"),
          "move",
        );
        await userEvent.selectOptions(
          within(recovery).getByLabelText("New room"),
          "8",
        );
      }
      const originalReason = within(recovery).getByLabelText(
        "Reason",
      ) as HTMLTextAreaElement;
      if (!originalReason.value)
        await userEvent.type(originalReason, "Synthetic booking correction");
      expect(
        within(recovery).queryByRole("button", {
          name: /Review price|Confirm changes|Load latest stay/,
        }),
      ).not.toBeInTheDocument();
      const quoted = calls("/api/v1/booking-quotes", "POST").length;
      await userEvent.click(
        within(recovery).getByRole("button", { name: "Check previous save" }),
      );
      await waitFor(() => expect(recovery).not.toBeInTheDocument());
      expect(calls(target, "POST")).toHaveLength(1);
      expect(calls("/api/v1/booking-quotes", "POST")).toHaveLength(quoted);
      expect(saved).toMatchObject({ status: "CANCELLED", version: 2 });
      expect(sessionStorage.getItem("villarosa.ownPendingOperations.v2")).toBe(
        "{}",
      );
    },
  );

  async function booked() {
    await enter();
    await userEvent.click(await review());
    await screen.findByRole("heading", { name: "Agreed accommodation price" });
  }
  async function dialogFor(kind: "stay" | "move") {
    await userEvent.click(
      await screen.findByRole("button", {
        name: kind === "stay" ? "Edit stay" : "Move room",
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name: kind === "stay" ? "Edit stay" : "Move room",
    });
    const reason = within(dialog).getByLabelText("Reason");
    if (!(reason as HTMLTextAreaElement).value)
      await userEvent.type(reason, "Synthetic booking correction");
    return dialog;
  }
  async function checkout(dialog: HTMLElement, value: string) {
    await userEvent.clear(within(dialog).getByLabelText("Check-out"));
    await userEvent.type(within(dialog).getByLabelText("Check-out"), value);
  }
  async function editQuote(dialog: HTMLElement) {
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Review price" }),
    );
    return within(dialog).findByRole("button", { name: /Confirm changes/ });
  }
  it("does not let an abandoned older Load latest erase a newer reopened stay draft", async () => {
    await booked();
    const original = await dialogFor("stay");
    await checkout(original, "2030-01-04");
    saved = { ...saved, version: 1, endDate: "2030-01-05" };
    generation = "stale-draft-session";
    await act(async () => {
      await refreshSession({ explicit: true });
    });
    const first = await dialogFor("stay");
    let finishOld: (response: Response) => void = () => {};
    let hold = true;
    const oldSnapshot = { ...saved };
    api.mockImplementation((url, init) => {
      if (
        path(url) === "/api/v1/reservations/42" &&
        (!init?.method || init.method === "GET") &&
        hold
      ) {
        hold = false;
        return new Promise<Response>((resolve) => {
          finishOld = resolve;
        });
      }
      return responses(url, init);
    });
    await userEvent.click(
      within(first).getByRole("button", { name: "Load latest stay" }),
    );
    await act(async () => {
      window.history.back();
    });
    await screen.findByRole("heading", {
      name: "New reservation",
    });
    await act(async () => {
      window.history.forward();
    });
    await screen.findByRole("heading", {
      name: "Reservation #42",
    });
    saved = { ...saved, version: 2, endDate: "2030-01-06" };
    const current = await dialogFor("stay");
    await userEvent.click(
      within(current).getByRole("button", { name: "Load latest stay" }),
    );
    await waitFor(() =>
      expect(within(current).getByLabelText("Check-out")).toHaveValue(
        "2030-01-06",
      ),
    );
    await checkout(current, "2030-01-07");
    await act(async () => {
      finishOld(json(oldSnapshot));
    });
    await userEvent.click(
      within(current).getByRole("button", { name: "Close dialog" }),
    );
    const reopened = await dialogFor("stay");
    expect(within(reopened).getByLabelText("Check-out")).toHaveValue(
      "2030-01-07",
    );
  });

  it("requires explicit whole-stay price acceptance for dates and room moves and retains the agreements", async () => {
    await booked();
    const stay = await dialogFor("stay");
    await checkout(stay, "2030-01-04");
    const accept = await editQuote(stay);
    expect(accept).toHaveTextContent("€150.03");
    expect(calls("/api/v1/reservations/42/change", "POST")).toHaveLength(0);
    await userEvent.click(accept);
    await waitFor(() => expect(stay).not.toBeInTheDocument());
    expect(saved).toMatchObject({ endDate: "2030-01-04", version: 1 });
    const move = await dialogFor("move");
    await userEvent.selectOptions(within(move).getByLabelText("New room"), "8");
    const moveAccept = await editQuote(move);
    expect(moveAccept).toHaveTextContent("€180.03");
    await userEvent.click(moveAccept);
    await waitFor(() => expect(move).not.toBeInTheDocument());
    expect(saved).toMatchObject({
      roomId: 8,
      endDate: "2030-01-04",
      version: 2,
    });
    expect(agreements.map((value) => value.quote.price.totalCents)).toEqual([
      10002, 15003, 18003,
    ]);
    await userEvent.click(
      screen.getByRole("button", { name: "Price history" }),
    );
    expect(await screen.findByText("Current agreement")).toBeInTheDocument();
    expect(screen.getAllByText("Previous agreement")).toHaveLength(2);
    expect(
      body(calls("/api/v1/reservations/42/move", "POST")[0][1]),
    ).toMatchObject({ roomId: 8, expectedVersion: 1 });
  });
  it("requires a new party-size agreement even when the room total is unchanged", async () => {
    await booked();
    const stay = await dialogFor("stay");
    await userEvent.clear(within(stay).getByLabelText("Guests"));
    await userEvent.type(within(stay).getByLabelText("Guests"), "3");
    const accept = await editQuote(stay);
    expect(accept).toHaveTextContent("€100.02");
    await userEvent.click(accept);
    await waitFor(() => expect(stay).not.toBeInTheDocument());
    expect(agreements).toHaveLength(2);
    expect(agreements[1].quote.id).not.toBe(agreements[0].quote.id);
    expect(saved).toMatchObject({ guestCount: 3, version: 1 });
  });
  it("asks for a second explicit acceptance when edit rates change and retains entered details", async () => {
    await booked();
    let first = true;
    api.mockImplementation((url, init) => {
      if (path(url) === "/api/v1/reservations/42/change" && first) {
        first = false;
        const fresh = testQuote(
          { ...input, endDate: "2030-01-04" },
          crypto.randomUUID(),
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
    const stay = await dialogFor("stay");
    await checkout(stay, "2030-01-04");
    await userEvent.click(await editQuote(stay));
    const accept = await within(stay).findByRole("button", {
      name: "Confirm changes · €180.03",
    });
    expect(within(stay).getByLabelText("Check-out")).toHaveValue("2030-01-04");
    expect(calls("/api/v1/reservations/42/change", "POST")).toHaveLength(1);
    expect(saved!.version).toBe(0);
    await userEvent.click(accept);
    await waitFor(() => expect(stay).not.toBeInTheDocument());
    expect(calls("/api/v1/reservations/42/change", "POST")).toHaveLength(2);
    expect(agreements.at(-1)!.quote.price.totalCents).toBe(18003);
  });
  it("hides an edit quote when the requested dates change", async () => {
    await booked();
    const stay = await dialogFor("stay");
    await checkout(stay, "2030-01-04");
    await editQuote(stay);
    await checkout(stay, "2030-01-05");
    expect(
      within(stay).queryByRole("button", { name: /Confirm changes/ }),
    ).not.toBeInTheDocument();
    expect(calls("/api/v1/reservations/42/change", "POST")).toHaveLength(0);
  });
  it("recovers a lost date-change response after full reload without another quote or write", async () => {
    await booked();
    let lost = true;
    api.mockImplementation(async (url, init) => {
      if (path(url) === "/api/v1/reservations/42/change" && lost) {
        lost = false;
        await responses(url, init);
        throw new TypeError("Lost edit response");
      }
      return responses(url, init);
    });
    const stay = await dialogFor("stay");
    await checkout(stay, "2030-01-04");
    await userEvent.click(await editQuote(stay));
    await within(stay).findByText(/The result could not be confirmed/);
    cleanup();
    window.history.replaceState({}, "", scopedPath("/reservations/42"));
    await act(async () => {
      render(<App />);
    });
    const restored = await dialogFor("stay");
    const quoteCount = calls("/api/v1/booking-quotes", "POST").length;
    expect(
      within(restored).getByRole("button", { name: "Review price" }),
    ).toBeDisabled();
    await userEvent.click(
      within(restored).getByRole("button", { name: "Check previous save" }),
    );
    await waitFor(() => expect(restored).not.toBeInTheDocument());
    expect(calls("/api/v1/booking-quotes", "POST")).toHaveLength(quoteCount);
    expect(calls("/api/v1/reservations/42/change", "POST")).toHaveLength(1);
  });
  it("can reconcile a lost move after reload when the destination has become the current room", async () => {
    await booked();
    let lost = true;
    api.mockImplementation(async (url, init) => {
      if (path(url) === "/api/v1/reservations/42/move" && lost) {
        lost = false;
        await responses(url, init);
        throw new TypeError("Lost move response");
      }
      return responses(url, init);
    });
    const move = await dialogFor("move");
    await userEvent.selectOptions(within(move).getByLabelText("New room"), "8");
    await userEvent.click(await editQuote(move));
    await within(move).findByText(/The result could not be confirmed/);
    cleanup();
    window.history.replaceState({}, "", scopedPath("/reservations/42"));
    await act(async () => {
      render(<App />);
    });
    const restored = await dialogFor("move");
    await userEvent.click(
      within(restored).getByRole("checkbox", {
        name: "Include other rooms for an interrupted save",
      }),
    );
    await userEvent.selectOptions(
      within(restored).getByLabelText("New room"),
      "8",
    );
    const quoted = calls("/api/v1/booking-quotes", "POST").length;
    expect(
      within(restored).getByRole("button", { name: "Review price" }),
    ).toBeDisabled();
    await userEvent.click(
      within(restored).getByRole("button", { name: "Check previous save" }),
    );
    await waitFor(() => expect(restored).not.toBeInTheDocument());
    expect(calls("/api/v1/reservations/42/move", "POST")).toHaveLength(1);
    expect(calls("/api/v1/booking-quotes", "POST")).toHaveLength(quoted);
  });

  it("retains the reviewed booking version across reauthentication until a protected reload", async () => {
    await booked();
    const stay = await dialogFor("stay");
    await checkout(stay, "2030-01-04");
    saved = { ...saved, version: 1, endDate: "2030-01-05" };
    generation = "changed-booking-session";
    await act(async () => {
      await refreshSession({ explicit: true });
    });
    const restored = await dialogFor("stay");
    expect(within(restored).getByLabelText("Check-out")).toHaveValue(
      "2030-01-04",
    );
    expect(
      within(restored).getByRole("button", { name: "Review price" }),
    ).toBeDisabled();
    const reads = calls("/api/v1/reservations/42", "GET").length;
    await userEvent.click(
      within(restored).getByRole("button", { name: "Load latest stay" }),
    );
    await waitFor(() =>
      expect(within(restored).getByLabelText("Check-out")).toHaveValue(
        "2030-01-05",
      ),
    );
    expect(calls("/api/v1/reservations/42", "GET")).toHaveLength(reads + 1);
    await checkout(restored, "2030-01-06");
    await userEvent.click(await editQuote(restored));
    await waitFor(() => expect(restored).not.toBeInTheDocument());
    expect(
      body(calls("/api/v1/reservations/42/change", "POST")[0][1])
        .expectedVersion,
    ).toBe(1);
  });
  it("retains entered edit fields when loading the latest reservation fails", async () => {
    await booked();
    const stay = await dialogFor("stay");
    await checkout(stay, "2030-01-04");
    api.mockImplementation((url, init) =>
      path(url) === "/api/v1/reservations/42/change"
        ? Promise.resolve(json({ code: "STALE_VERSION" }, 409))
        : responses(url, init),
    );
    await userEvent.click(await editQuote(stay));
    await within(stay).findByRole("button", { name: "Load latest stay" });
    api.mockImplementation((url, init) =>
      path(url) === "/api/v1/reservations/42"
        ? Promise.reject(new TypeError("Read unavailable"))
        : responses(url, init),
    );
    await userEvent.click(
      within(stay).getByRole("button", { name: "Load latest stay" }),
    );
    await within(stay).findByText(/The result could not be confirmed/);
    expect(within(stay).getByLabelText("Check-out")).toHaveValue("2030-01-04");
    expect(
      within(stay).getByRole("button", { name: "Refresh quote" }),
    ).toBeDisabled();
  });
  it("offers rate configuration instead of an unpriced edit", async () => {
    await booked();
    api.mockImplementation((url, init) =>
      path(url) === "/api/v1/booking-quotes"
        ? Promise.resolve(json({ code: "RATES_REQUIRED" }, 409))
        : responses(url, init),
    );
    const stay = await dialogFor("stay");
    await checkout(stay, "2030-01-04");
    await userEvent.click(
      within(stay).getByRole("button", { name: "Review price" }),
    );
    expect(
      await within(stay).findByRole("link", {
        name: "Configure this room's rates",
      }),
    ).toHaveAttribute("href", scopedPath("/rooms/7#rates"));
    expect(calls("/api/v1/reservations/42/change", "POST")).toHaveLength(0);
  });

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
    window.history.replaceState({}, "", scopedPath("/reservations/42"));
    await act(async () => {
      render(<App />);
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Price history" }),
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
    window.history.replaceState({}, "", scopedPath("/reservations/42"));
    await act(async () => {
      render(<App />);
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Price history" }),
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
    await waitFor(() =>
      expect(calls("/api/v1/reservations/quoted", "POST")).toHaveLength(1),
    );
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
    ).toHaveAttribute("href", scopedPath("/rooms/7#rates"));
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
    await waitFor(() =>
      expect(calls("/api/v1/reservations/quoted", "POST")).toHaveLength(1),
    );
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

it("production Detail retains a newer explicit operating-state reload over a held background GET", async () => {
  const { onlineManager, QueryCache } = await import("@tanstack/react-query");
  const built = vi.spyOn(QueryCache.prototype, "build");
  let hold = false;
  let release!: (response: Response) => void;
  api.mockImplementation((url, init) => {
    const route = path(url);
    if (route === "/api/v1/reservations/42" && hold) {
      hold = false;
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    }
    if (route === "/api/v1/reservations/42/ledger")
      return Promise.resolve(
        json({
          reservation: saved,
          propertyDate: "2026-11-07",
          currency: "EUR",
          agreedCents: 10002,
          accommodationCents: 10002,
          outstandingCents: 10002,
          creditCents: 0,
          totals: { paymentsCents: 0, refundsCents: 0, receivedCents: 0 },
        }),
      );
    if (route === "/api/v1/apartments/7/readiness")
      return Promise.resolve(
        json({
          roomId: 7,
          state: "CLEAN",
          version: 3,
          changedAt: "2026-11-07T09:00:00Z",
        }),
      );
    return responses(url, init);
  });
  await enter();
  await userEvent.click(await review());
  await screen.findByRole("heading", { name: "Reservation #42" });
  const launch = await screen.findByRole("button", {
    name: "Cancel reservation",
  });
  await waitFor(() => expect(launch).toBeEnabled());
  await userEvent.click(launch);
  const dialog = within(
    screen.getByRole("dialog", { name: "Cancel reservation" }),
  );
  const older = structuredClone(saved!);
  hold = true;
  const now = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(now + 60_000);
  try {
    await act(async () => {
      onlineManager.setOnline(false);
    });
    await act(async () => {
      onlineManager.setOnline(true);
    });
    await waitFor(() => expect(release).toBeTypeOf("function"));
    const target = built.mock.results
      .map((result) => result.value)
      .find(
        (query) =>
          JSON.stringify(query?.queryKey) ===
          JSON.stringify(["reservations", 42]),
      )!;
    const background = target.promise;
    saved = { ...saved, version: 1 };
    await userEvent.click(
      dialog.getByRole("button", { name: "Load current stay" }),
    );
    await waitFor(() =>
      expect(
        dialog.getByRole("button", { name: "Load current stay" }),
      ).toBeEnabled(),
    );
    await waitFor(() =>
      expect(target.state.data).toMatchObject({ version: 1 }),
    );
    await act(async () => {
      release(json(older));
      await background;
    });
    expect(target.state.data).toMatchObject({ version: 1 });
    await waitFor(() =>
      expect(
        dialog.getByRole("button", { name: "Review action" }),
      ).toBeEnabled(),
    );
  } finally {
    clock.mockRestore();
    onlineManager.setOnline(true);
    built.mockRestore();
  }
});
