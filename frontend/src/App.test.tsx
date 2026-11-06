import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { refreshSession } from "./api/session";

const api = vi.fn<typeof fetch>();
const room = {
  id: 7,
  capacity: 2,
  view: "Lake room",
  orientation: "South",
  active: true,
};
const guest = {
  id: 5,
  firstName: "Test",
  lastName: "Guest",
  phone: "000",
  address: "Synthetic",
};
let authenticated = true;
let ownerId = "owner-test";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const session = () => ({
  authenticated,
  generation: "test-login",
  staff: {
    id: ownerId,
    email: "owner@example.test",
    role: "OWNER",
    active: true,
    version: 0,
  },
  csrfToken: "csrf-test",
  expiresAt: "2099-01-01T00:00:00Z",
  permissions: ["staff:manage"],
  provider: "synthetic",
});
const responses = async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/apartments")) return json([room]);
  if (url.includes("/reservations?"))
    return json({ items: [], nextCursor: null });
  if (url.includes("/customers/search")) return json([guest]);
  if (url.includes("/customers/5")) return json(guest);
  if (url.includes("/staff/invitations")) return json([]);
  if (url.endsWith("/staff")) return json([session().staff]);
  return json({ code: "NOT_FOUND" }, 404);
};
beforeEach(async () => {
  authenticated = true;
  ownerId = "owner-test";
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/rooms");
  api.mockReset();
  api.mockImplementation(responses);
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).endsWith("/auth/session")
      ? Promise.resolve(json(session()))
      : api(input, init),
  );
  await refreshSession({ explicit: true });
});
afterEach(() => vi.unstubAllGlobals());

describe("routed staff workspace", () => {
  it("loads the direct room route and exposes only implemented navigation", async () => {
    await mount();
    expect(
      await screen.findByRole("heading", { name: "Lake room · South" }),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(
      expect.arrayContaining([
        "▤Reservations",
        "♧Guests",
        "▥Rooms",
        "⚙Owner settings",
      ]),
    );
    expect(screen.queryByText("API Settings")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Rates" }),
    ).not.toBeInTheDocument();
  });
  it("keeps navigation usable while a room query never settles", async () => {
    api.mockImplementationOnce(() => new Promise<Response>(() => {}));
    await mount();
    await userEvent.click(screen.getByRole("link", { name: "Guests" }));
    expect(
      await screen.findByRole("button", { name: "Add guest" }),
    ).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Add guest" }));
    expect(
      screen.getByRole("dialog", { name: "Add guest" }),
    ).toBeInTheDocument();
  });
  it("distinguishes query failure from an empty inventory and allows retry", async () => {
    api.mockRejectedValueOnce(new TypeError("Offline"));
    await mount();
    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Lake room · South" }),
    ).toBeInTheDocument();
  });
  it("validates guest fields inline and focuses the first invalid field", async () => {
    window.history.replaceState({}, "", "/guests");
    await mount();
    await userEvent.click(screen.getByRole("button", { name: "Add guest" }));
    const form = screen.getByRole("form", { name: "Add guest" });
    await userEvent.click(
      within(form).getByRole("button", { name: "Save guest" }),
    );
    expect(
      await within(form).findAllByText("This field is required."),
    ).toHaveLength(4);
    expect(within(form).getByLabelText("First name")).toHaveFocus();
    expect(
      api.mock.calls.some(([url]) => String(url) === "/api/v1/customers"),
    ).toBe(false);
  });
  it("uses JSON guest writes and retains entered details after an unconfirmed result", async () => {
    window.history.replaceState({}, "", "/guests");
    api.mockImplementation(async (input) =>
      String(input) === "/api/v1/customers"
        ? Promise.reject(new TypeError("Lost response"))
        : responses(input),
    );
    await mount();
    await userEvent.click(screen.getByRole("button", { name: "Add guest" }));
    const form = screen.getByRole("form", { name: "Add guest" });
    for (const [label, value] of [
      ["First name", "Test"],
      ["Last name", "Guest"],
      ["Phone", "000"],
      ["Address", "Synthetic"],
    ])
      await userEvent.type(within(form).getByLabelText(label), value);
    await userEvent.click(
      within(form).getByRole("button", { name: "Save guest" }),
    );
    expect(
      await screen.findByText(/The result could not be confirmed/),
    ).toBeInTheDocument();
    expect(within(form).getByLabelText("Address")).toHaveValue("Synthetic");
    const call = api.mock.calls.find(
      ([input]) => String(input) === "/api/v1/customers",
    )!;
    expect(JSON.parse(String(call[1]?.body))).toMatchObject(
      guestSchemaFields(),
    );
    expect(new Headers(call[1]?.headers).get("X-CSRF-TOKEN")).toBe("csrf-test");
    expect(localStorage.length).toBe(0);
  });
  it("runs private guest search without putting contacts in the URL", async () => {
    window.history.replaceState({}, "", "/guests");
    await mount();
    const form = screen.getByRole("form", { name: "Search guests" });
    await userEvent.type(within(form).getByLabelText("Phone"), "000");
    await userEvent.click(
      within(form).getByRole("button", { name: "Search guests" }),
    );
    expect(
      await screen.findByRole("cell", { name: "Test Guest" }),
    ).toBeInTheDocument();
    const call = api.mock.calls.find(([input]) =>
      String(input).endsWith("/customers/search"),
    )!;
    expect(call[1]?.method).toBe("POST");
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({ phone: "000" });
    expect(window.location.search).toBe("");
  });
  it("keeps adding a guest available during a pending guest search", async () => {
    window.history.replaceState({}, "", "/guests");
    api.mockImplementation(() => new Promise<Response>(() => {}));
    await mount();
    await userEvent.type(screen.getByLabelText("First name"), "Test");
    await userEvent.click(
      screen.getByRole("button", { name: "Search guests" }),
    );
    expect(
      screen.getByRole("button", { name: "Search guests" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add guest" })).toBeEnabled();
  });
  it("does not request an invalid deep-link query window", async () => {
    window.history.replaceState(
      {},
      "",
      "/reservations?from=2026-02-30&to=2026-11-06",
    );
    await mount();
    expect(screen.getByText(/Choose valid dates/)).toBeInTheDocument();
    expect(
      api.mock.calls.some(([url]) => String(url).includes("/reservations?")),
    ).toBe(false);
    await userEvent.click(
      screen.getByRole("button", { name: "Reset filters" }),
    );
    await screen.findByText("No stays in this period");
  });
  it("clears protected query data after expiry and makes a fresh request after same-Owner login", async () => {
    await mount();
    await screen.findByRole("heading", { name: "Lake room · South" });
    authenticated = false;
    await act(async () => {
      await refreshSession();
    });
    expect(
      screen.queryByRole("heading", { name: "Lake room · South" }),
    ).not.toBeInTheDocument();
    api.mockResolvedValueOnce(json([]));
    authenticated = true;
    await act(async () => {
      await refreshSession({ explicit: true });
    });
    expect(await screen.findByText("No rooms configured")).toBeInTheDocument();
    expect(
      api.mock.calls.filter(([url]) => String(url).includes("/apartments")),
    ).toHaveLength(2);
  });
  it("preserves entered booking input in memory after expiry without repeating a write", async () => {
    window.history.replaceState({}, "", "/reservations/new");
    await mount();
    await userEvent.type(
      screen.getByRole("combobox", { name: "Guest" }),
      "Retained",
    );
    authenticated = false;
    await act(async () => {
      await refreshSession();
    });
    expect(
      screen.queryByRole("combobox", { name: "Guest" }),
    ).not.toBeInTheDocument();
    authenticated = true;
    await act(async () => {
      await refreshSession({ explicit: true });
    });
    expect(screen.getByRole("combobox", { name: "Guest" })).toHaveValue(
      "Retained",
    );
    expect(
      api.mock.calls.some(
        ([, init]) =>
          init?.method === "POST" && String(init?.body).includes("roomId"),
      ),
    ).toBe(false);
  });
  it("selects a guest through keyboard interaction and never asks for a manual ID", async () => {
    window.history.replaceState({}, "", "/reservations/new");
    await mount();
    const input = screen.getByRole("combobox", { name: "Guest" });
    await userEvent.type(input, "Tes");
    await screen.findByRole("option", { name: /Test Guest/ });
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(input).toHaveValue("Test Guest");
    expect(screen.queryByLabelText("Customer ID")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Room ID")).not.toBeInTheDocument();
  });
  it("requires review after a stale edit and uses the version shown when confirmation opened", async () => {
    window.history.replaceState({}, "", "/reservations/42");
    let version = 0;
    let cancelled = false;
    api.mockImplementation(async (input, init) => {
      const url = new URL(String(input), "http://test");
      if (url.pathname === "/api/v1/reservations/42/events")
        return json({ items: [], nextCursor: null });
      if (url.pathname === "/api/v1/reservations/42")
        return json({
          id: 42,
          customerId: 5,
          roomId: 7,
          startDate: "2026-11-06",
          endDate: version ? "2026-11-12" : "2026-11-09",
          guestCount: 1,
          nights: 3,
          status: cancelled ? "CANCELLED" : "ACTIVE",
          version,
        });
      if (init?.method === "DELETE") {
        if (url.searchParams.get("expectedVersion") === "0") {
          version = 1;
          return json({ code: "STALE_VERSION" }, 409);
        }
        cancelled = true;
        version = 2;
        return new Response(null, { status: 200 });
      }
      if (url.pathname.startsWith("/api/v1/operations/"))
        return json({
          key: url.pathname.split("/").pop(),
          kind: "CANCEL",
          resourceId: 42,
        });
      return responses(input);
    });
    await mount();
    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel reservation" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm cancellation" }),
    );
    expect(
      await screen.findByText(
        /Close this dialog and review the latest details/,
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Confirm cancellation" }),
    ).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel reservation" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm cancellation" }),
    );
    expect(
      await screen.findByText("Cancelled", { exact: true }),
    ).toBeInTheDocument();
    expect(
      api.mock.calls
        .filter(([, init]) => init?.method === "DELETE")
        .map(([url]) =>
          new URL(String(url), "http://test").searchParams.get(
            "expectedVersion",
          ),
        ),
    ).toEqual(["0", "1"]);
  });
  it("prevents duplicate guest creation while the first submission is pending", async () => {
    window.history.replaceState({}, "", "/guests");
    let finish: (value: Response) => void = () => {};
    api.mockImplementation(async (input) =>
      String(input) === "/api/v1/customers"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : responses(input),
    );
    await mount();
    await userEvent.click(screen.getByRole("button", { name: "Add guest" }));
    const form = screen.getByRole("form", { name: "Add guest" });
    for (const [label, value] of [
      ["First name", "Test"],
      ["Last name", "Guest"],
      ["Phone", "000"],
      ["Address", "Synthetic"],
    ])
      await userEvent.type(within(form).getByLabelText(label), value);
    await userEvent.dblClick(
      within(form).getByRole("button", { name: "Save guest" }),
    );
    expect(
      api.mock.calls.filter(([url]) => String(url) === "/api/v1/customers"),
    ).toHaveLength(1);
    finish(json(5));
    await screen.findByRole("link", { name: "View guest details" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
  it("starts a new empty draft when another Owner signs in", async () => {
    window.history.replaceState({}, "", "/reservations/new");
    await mount();
    await userEvent.type(
      screen.getByRole("combobox", { name: "Guest" }),
      "Private draft",
    );
    ownerId = "other-owner";
    await act(async () => {
      await refreshSession({ explicit: true });
    });
    expect(await screen.findByRole("combobox", { name: "Guest" })).toHaveValue(
      "",
    );
  });
  it("reconciles a lost create after same-Owner recovery makes the committed room unavailable", async () => {
    window.history.replaceState({}, "", "/reservations/new?guest=5");
    let committed = false;
    api.mockImplementation(async (input, init) => {
      const url = new URL(String(input), "http://test");
      if (url.pathname === "/api/v1/reservations/available-apartments")
        return json(committed ? [] : [room]);
      if (url.pathname === "/api/v1/reservations" && init?.method === "POST") {
        committed = true;
        throw new TypeError("Response lost after commit");
      }
      if (url.pathname.startsWith("/api/v1/operations/"))
        return json({
          key: url.pathname.split("/").pop(),
          kind: "CREATE",
          resourceId: 42,
        });
      return responses(input);
    });
    await mount();
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Guest" })).toHaveValue(
        "Test Guest",
      ),
    );
    await userEvent.selectOptions(await screen.findByLabelText("Room"), "7");
    await userEvent.click(
      screen.getByRole("button", { name: "Create reservation" }),
    );
    expect(
      await screen.findByText(/The result could not be confirmed/),
    ).toBeInTheDocument();
    expect(
      sessionStorage.getItem("villarosa.ownPendingOperations.v2"),
    ).toContain("key");
    authenticated = false;
    await act(async () => {
      await refreshSession();
    });
    authenticated = true;
    await act(async () => {
      await refreshSession({ explicit: true });
    });
    expect(
      await screen.findByText("No rooms currently available"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Create reservation" }),
    );
    await waitFor(() =>
      expect(
        api.mock.calls.filter(([url]) =>
          String(url).includes("/api/v1/operations/"),
        ),
      ).toHaveLength(1),
    );
  });
  it("refreshes current reservation after a confirmed write in a new same-Owner login generation", async () => {
    window.history.replaceState({}, "", "/reservations/42");
    let cancelled = false;
    api.mockImplementation(async (input, init) => {
      const url = new URL(String(input), "http://test");
      if (url.pathname === "/api/v1/reservations/42/events")
        return json({ items: [], nextCursor: null });
      if (url.pathname === "/api/v1/reservations/42")
        return json({
          id: 42,
          customerId: 5,
          roomId: 7,
          startDate: "2026-11-06",
          endDate: "2026-11-09",
          guestCount: 1,
          nights: 3,
          status: cancelled ? "CANCELLED" : "ACTIVE",
          version: cancelled ? 1 : 0,
        });
      if (init?.method === "DELETE") {
        cancelled = true;
        return new Response(null, { status: 200 });
      }
      if (url.pathname.startsWith("/api/v1/operations/"))
        return json({
          key: url.pathname.split("/").pop(),
          kind: "CANCEL",
          resourceId: 42,
        });
      return responses(input);
    });
    await mount();
    await screen.findByRole("button", { name: "Cancel reservation" });
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith("/auth/session")
        ? Promise.resolve(
            json({ ...session(), generation: "fresh-login-with-same-owner" }),
          )
        : api(input, init),
    );
    await act(async () => {
      await refreshSession({ explicit: true });
    });
    await waitFor(() =>
      expect(
        api.mock.calls.filter(
          ([input]) => String(input) === "/api/v1/reservations/42",
        ),
      ).toHaveLength(2),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel reservation" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm cancellation" }),
    );
    await screen.findByText(
      "Request confirmed. Review the current reservation below.",
    );
    expect(
      await screen.findByText("Cancelled", { exact: true }),
    ).toBeInTheDocument();
  });
});
function guestSchemaFields() {
  return {
    firstName: "Test",
    lastName: "Guest",
    phone: "000",
    address: "Synthetic",
  };
}

async function mount() {
  render(<App />);
  await screen.findByRole("heading", { level: 1 });
}
