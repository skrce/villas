import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import App from "../App";
import { getSession, refreshSession, selectBusiness } from "../api/session";

const tracked = vi.hoisted(() => ({ clients: [] as QueryClient[] }));
vi.mock("@tanstack/react-query", async (original) => {
  const actual = await original<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    QueryClient: class extends actual.QueryClient {
      constructor(...args: ConstructorParameters<typeof actual.QueryClient>) {
        super(...args);
        tracked.clients.push(this);
      }
    },
  };
});
const request = vi.fn<typeof fetch>();
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
let person = 0;
let identity = "";
let allowed = ["villa-a", "villa-b"];
let generation = "login-one";
let authenticated = true;
const staff = (id: string) => ({
  id: `owner-${id}`,
  email: "owner@example.test",
  role: "OWNER",
  active: true,
  version: 0,
});
const memberships = () =>
  allowed.map((id) => ({
    businessId: id,
    businessName: id === "villa-a" ? "Blue lodge" : "Green lodge",
    staff: staff(id),
    permissions: ["staff:manage"],
  }));
const session = () => ({
  authenticated,
  identity: { id: identity, email: "owner@example.test" },
  memberships: memberships(),
  csrfToken: "test-csrf",
  generation,
  expiresAt: "2099-01-01T00:00:00Z",
  provider: "synthetic",
  propertyId: "villa-a",
  propertyName: "Blue lodge",
  staff: staff("villa-a"),
  permissions: ["staff:manage"],
});
const room = (business: string) => ({
  id: 7,
  propertyId: business,
  name: business === "villa-a" ? "Blue private room" : "Green private room",
  reference: "R-1",
  capacity: 4,
  view: "Garden",
  orientation: "South",
  active: true,
  version: 0,
});
const respond = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const url = new URL(String(input), "http://localhost");
  if (url.pathname === "/api/v1/auth/session") return json(session());
  if (url.pathname === "/api/v1/auth/logout") {
    authenticated = false;
    return new Response(null, { status: 204 });
  }
  const business = new Headers(init?.headers).get("X-Villas-Business");
  if (!business || !allowed.includes(business))
    return json({ code: "BUSINESS_ACCESS_DENIED" }, 403);
  if (url.pathname === "/api/v1/apartments/directory")
    return json({ items: [room(business)], nextCursor: null });
  if (
    url.pathname === "/api/v1/apartments" ||
    url.pathname.endsWith("available-apartments")
  )
    return json([room(business)]);
  if (url.pathname.startsWith("/api/v1/customers"))
    return json({ items: [], nextCursor: null });
  if (url.pathname === "/api/v1/reservations")
    return json({ items: [], nextCursor: null });
  return json({ code: "NOT_FOUND" }, 404);
};
beforeEach(async () => {
  identity = `canonical-${++person}`;
  allowed = ["villa-a", "villa-b"];
  generation = "login-one";
  authenticated = true;
  tracked.clients.length = 0;
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/businesses/villa-a/rooms");
  request.mockReset();
  request.mockImplementation(respond);
  vi.stubGlobal("fetch", request);
  await refreshSession({ explicit: true });
});
afterEach(() => vi.unstubAllGlobals());
const switchTo = async (id: string) =>
  userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Business" }),
    id,
  );
const startBooking = async () => {
  await userEvent.click(screen.getByRole("link", { name: "Reservations" }));
  await userEvent.click(
    await screen.findByRole("link", { name: /New reservation/ }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Show all steps" }),
  );
  await screen.findByRole("combobox", { name: "Guest" });
};

describe("business workspace boundaries", () => {
  it("keeps independent booking fields and page locations without submitting when switching back", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Blue private room" });
    await startBooking();
    await userEvent.type(
      screen.getByRole("combobox", { name: "Guest" }),
      "Private blue draft",
    );
    await userEvent.clear(screen.getByLabelText("Guests", { exact: true }));
    await userEvent.type(screen.getByLabelText("Guests", { exact: true }), "3");
    await switchTo("villa-b");
    expect(window.location.pathname).toBe("/businesses/villa-b/today");
    await startBooking();
    expect(screen.getByRole("combobox", { name: "Guest" })).toHaveValue("");
    await userEvent.type(
      screen.getByRole("combobox", { name: "Guest" }),
      "Private green draft",
    );
    await switchTo("villa-a");
    expect(window.location.pathname).toBe(
      "/businesses/villa-a/reservations/new",
    );
    expect(await screen.findByRole("combobox", { name: "Guest" })).toHaveValue(
      "Private blue draft",
    );
    expect(screen.getByLabelText("Guests", { exact: true })).toHaveValue(3);
    await switchTo("villa-b");
    expect(await screen.findByRole("combobox", { name: "Guest" })).toHaveValue(
      "Private green draft",
    );
    expect(
      request.mock.calls.filter(
        ([url, init]) =>
          String(url).includes("reservations/quoted") &&
          init?.method === "POST",
      ),
    ).toHaveLength(0);
    expect(JSON.stringify(localStorage)).not.toContain("Private");
    expect(JSON.stringify(sessionStorage)).not.toContain("Private");
  });
  it("aborts held reads, clears the old cache and binds new cache hashes to business and member", async () => {
    let finish!: (response: Response) => void;
    request.mockImplementation((input, init) =>
      String(input).includes("apartments/directory") &&
      new Headers(init?.headers).get("X-Villas-Business") === "villa-a"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : respond(input, init),
    );
    render(<App />);
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    const old = tracked.clients[0];
    const signal = request.mock.calls.find(([url]) =>
      String(url).includes("apartments/directory"),
    )?.[1]?.signal;
    await switchTo("villa-b");
    await userEvent.click(screen.getByRole("link", { name: "Rooms" }));
    await screen.findByRole("heading", { name: "Green private room" });
    await act(async () =>
      finish(json({ items: [room("villa-a")], nextCursor: null })),
    );
    expect(signal?.aborted).toBe(true);
    expect(
      screen.queryByRole("heading", { name: "Blue private room" }),
    ).not.toBeInTheDocument();
    expect(old.getQueryCache().getAll()).toHaveLength(0);
    const current = tracked.clients.at(-1)!;
    expect(
      current
        .getQueryCache()
        .getAll()
        .every(
          (query) =>
            query.queryHash.includes("villa-b") &&
            query.queryHash.includes("owner-villa-b"),
        ),
    ).toBe(true);
  });
  it("hides a removed business while preserving another membership and the first business's private draft", async () => {
    window.history.replaceState({}, "", "/businesses/villa-a/reservations/new");
    render(<App />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Show all steps" }),
    );
    await userEvent.type(
      screen.getByRole("combobox", { name: "Guest" }),
      "Renewed blue draft",
    );
    allowed = ["villa-b"];
    await act(async () => {
      await refreshSession();
    });
    expect(
      screen.getByRole("heading", { name: "Business unavailable" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("combobox", { name: "Guest" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("link", { name: "Open Green lodge" }),
    );
    expect(getSession()).toMatchObject({
      status: "authenticated",
      propertyId: "villa-b",
    });
    expect(
      screen.queryByRole("combobox", { name: "Business" }),
    ).not.toBeInTheDocument();
    allowed = ["villa-a", "villa-b"];
    generation = "renewed-login";
    await act(async () => {
      await refreshSession({ explicit: true });
    });
    await switchTo("villa-a");
    expect(await screen.findByRole("combobox", { name: "Guest" })).toHaveValue(
      "Renewed blue draft",
    );
    expect(
      request.mock.calls.filter(([url]) =>
        String(url).includes("reservations/quoted"),
      ),
    ).toHaveLength(0);
  });
  it("requires a deliberate business choice at the root even with one valid membership", async () => {
    allowed = ["villa-b"];
    window.history.replaceState({}, "", "/");
    await refreshSession();
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Choose a business" }),
    ).toBeVisible();
    expect(
      request.mock.calls.every(([url]) => String(url).endsWith("auth/session")),
    ).toBe(true);
    await userEvent.click(
      screen.getByRole("link", { name: "Open Green lodge" }),
    );
    expect(window.location.pathname).toBe("/businesses/villa-b/today");
    expect(
      screen.queryByRole("combobox", { name: "Business" }),
    ).not.toBeInTheDocument();
  });
  it("clears every business draft on confirmed sign-out", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Blue private room" });
    await startBooking();
    await userEvent.type(
      screen.getByRole("combobox", { name: "Guest" }),
      "Do not retain",
    );
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByRole("button", { name: "Sign in to local demo" });
    authenticated = true;
    generation = "fresh-login";
    await act(async () => {
      await refreshSession({ explicit: true });
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Show all steps" }),
    );
    expect(screen.getByRole("combobox", { name: "Guest" })).toHaveValue("");
  });
  it("invalidates a late mutation callback after switching before it can navigate or clear the old draft", async () => {
    let finish!: (response: Response) => void;
    request.mockImplementation((input, init) =>
      String(input) === "/api/v1/customers" && init?.method === "POST"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : respond(input, init),
    );
    window.history.replaceState({}, "", "/businesses/villa-a/guests");
    render(<App />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Add guest" }),
    );
    const form = within(screen.getByRole("dialog", { name: "Add guest" }));
    await userEvent.type(form.getByLabelText("First name"), "Blue pending");
    await userEvent.type(form.getByLabelText("Last name"), "Synthetic");
    await userEvent.click(form.getByRole("button", { name: "Save guest" }));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    await act(async () => selectBusiness("villa-b"));
    await act(async () => finish(json(17)));
    expect(window.location.pathname).toBe("/businesses/villa-b/today");
    expect(
      screen.queryByRole("link", { name: "View guest details" }),
    ).not.toBeInTheDocument();
    await switchTo("villa-a");
    await userEvent.click(
      await screen.findByRole("button", { name: "Add guest" }),
    );
    expect(
      within(screen.getByRole("dialog")).getByLabelText("First name"),
    ).toHaveValue("Blue pending");
    expect(
      request.mock.calls.filter(
        ([url, init]) =>
          String(url) === "/api/v1/customers" && init?.method === "POST",
      ),
    ).toHaveLength(1);
  });
});
