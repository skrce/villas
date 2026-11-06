import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onlineManager } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { refreshSession } from "../api/session";

type Guest = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  version: number;
};
type Room = {
  id: number;
  name: string;
  reference: string;
  capacity: number;
  orientation: string | null;
  view: string | null;
  bedConfiguration: string | null;
  features: string | null;
  floor: string | null;
  active: boolean;
  version: number;
};
type Block = {
  id: number;
  roomId: number;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  version: number;
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const guestFixture: Guest = {
  id: 5,
  firstName: "Test",
  lastName: "Guest",
  phone: "070123456",
  email: null,
  address: null,
  notes: null,
  active: true,
  version: 0,
};
const roomFixture: Room = {
  id: 7,
  name: "Garden studio",
  reference: "GARDEN-1",
  capacity: 4,
  orientation: "South",
  view: "Garden",
  bedConfiguration: "Queen bed",
  features: "Terrace",
  floor: "1",
  active: true,
  version: 0,
};
let guests: Map<number, Guest>;
let rooms: Map<number, Room>;
let blocks: Block[];
let operations: Map<string, unknown>;
let authenticated: boolean;
let generation: string;
const api = vi.fn<typeof fetch>();
const parsed = (input: RequestInfo | URL) =>
  new URL(String(input), "http://localhost");
const bodyOf = (init?: RequestInit) => JSON.parse(String(init?.body ?? "{}"));
const calls = (path: string, method: string) =>
  api.mock.calls.filter(
    ([input, init]) =>
      parsed(input).pathname === path && (init?.method ?? "GET") === method,
  );
const session = () => ({
  authenticated,
  generation,
  staff: {
    id: "owner-five",
    email: "owner@example.test",
    role: "OWNER",
    active: true,
    version: 0,
  },
  csrfToken: "csrf-five",
  expiresAt: "2099-01-01T00:00:00Z",
  permissions: [
    "staff:manage",
    "guests:write",
    "rooms:write",
    "maintenance:write",
  ],
  provider: "synthetic",
});
async function responses(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = parsed(input);
  const path = url.pathname;
  const method = init?.method ?? "GET";
  const body = bodyOf(init);
  if (path === "/api/v1/customers/query")
    return json({
      items: [...guests.values()].filter(
        (guest) => body.includeArchived || guest.active,
      ),
      nextCursor: null,
    });
  if (path === "/api/v1/customers/duplicates") return json([]);
  if (path === "/api/v1/customers" && method === "POST") {
    guests.set(9, {
      ...guestFixture,
      id: 9,
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone || null,
      email: body.email || null,
      address: body.address || null,
      notes: body.notes || null,
    });
    return json(9);
  }
  if (/^\/api\/v1\/customers\/\d+\/reservations$/.test(path))
    return json({
      items: [
        {
          id: 42,
          customerId: 5,
          roomId: 7,
          startDate: "2030-01-01",
          endDate: "2030-01-04",
          guestCount: 3,
          status: "CANCELLED",
          version: 1,
        },
      ],
      nextCursor: null,
    });
  const guestId = Number(path.split("/")[4]);
  if (
    /^\/api\/v1\/customers\/\d+(\/status)?$/.test(path) &&
    guests.has(guestId)
  ) {
    const guest = guests.get(guestId)!;
    if (method === "GET") return json(guest);
    if (body.expectedVersion !== guest.version)
      return json({ code: "STALE_VERSION" }, 409);
    const changed = path.endsWith("/status")
      ? { ...guest, active: body.active, version: guest.version + 1 }
      : {
          ...guest,
          firstName: body.firstName,
          lastName: body.lastName,
          phone: body.phone || null,
          email: body.email || null,
          address: body.address || null,
          notes: body.notes || null,
          version: guest.version + 1,
        };
    guests.set(guestId, changed);
    return json(changed);
  }
  if (path === "/api/v1/apartments/directory")
    return json({
      items: [...rooms.values()].filter(
        (room) =>
          url.searchParams.get("includeArchived") === "true" || room.active,
      ),
      nextCursor: null,
    });
  if (path === "/api/v1/apartments" && method === "GET")
    return json([...rooms.values()]);
  if (path === "/api/v1/apartments" && method === "POST") {
    const room = {
      ...roomFixture,
      ...body,
      id: 8,
      reference: body.reference.toUpperCase(),
      version: 0,
    };
    rooms.set(8, room);
    return json(room);
  }
  const roomId = Number(path.split("/")[4]);
  if (
    /^\/api\/v1\/apartments\/\d+\/maintenance$/.test(path) &&
    method === "POST"
  ) {
    const key = new Headers(init?.headers).get("Idempotency-Key")!;
    const block = { id: 30, roomId, ...body, status: "ACTIVE", version: 0 };
    blocks.push(block);
    operations.set(key, {
      key,
      kind: "BLOCK",
      resourceId: 30,
      maintenance: block,
    });
    return json(block);
  }
  if (
    /^\/api\/v1\/apartments\/\d+(\/status)?$/.test(path) &&
    rooms.has(roomId)
  ) {
    const room = rooms.get(roomId)!;
    if (method === "GET") return json(room);
    if (body.expectedVersion !== room.version)
      return json({ code: "STALE_VERSION" }, 409);
    const changed = path.endsWith("/status")
      ? { ...room, active: body.active, version: room.version + 1 }
      : { ...room, ...body.details, version: room.version + 1 };
    rooms.set(roomId, changed);
    return json(changed);
  }
  if (path === "/api/v1/reservations/available-apartments")
    return json([...rooms.values()].filter((room) => room.active));
  if (path === "/api/v1/reservations")
    return json({ items: [], nextCursor: null });
  if (path === "/api/v1/maintenance-blocks")
    return json({
      items: blocks.filter(
        (block) =>
          !url.searchParams.get("status") ||
          block.status === url.searchParams.get("status"),
      ),
      nextCursor: null,
    });
  if (path === "/api/v1/maintenance-blocks/30" && method === "DELETE") {
    const block = blocks.find((block) => block.id === 30)!;
    const changed = {
      ...block,
      status: "CANCELLED",
      version: block.version + 1,
    };
    blocks = [changed];
    const key = new Headers(init?.headers).get("Idempotency-Key")!;
    operations.set(key, {
      key,
      kind: "UNBLOCK",
      resourceId: 30,
      maintenance: changed,
    });
    return json(changed);
  }
  if (path.startsWith("/api/v1/operations/")) {
    const result = operations.get(path.split("/").pop()!);
    return result
      ? json(result)
      : json({ code: "OPERATION_NOT_COMMITTED" }, 404);
  }
  if (path === "/api/v1/maintenance-blocks/30/events")
    return json({
      items: [
        {
          id: "100",
          kind: "BLOCKED",
          startDate: "2030-01-10",
          endDate: "2030-01-12",
          occurredAt: "2026-11-06T12:00:00Z",
        },
      ],
      nextCursor: null,
    });
  return json({ code: "NOT_FOUND" }, 404);
}
beforeEach(async () => {
  guests = new Map([[5, { ...guestFixture }]]);
  rooms = new Map([[7, { ...roomFixture }]]);
  blocks = [];
  operations = new Map();
  authenticated = true;
  generation = "five-login-one";
  localStorage.clear();
  sessionStorage.clear();
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
async function mount(path: string) {
  window.history.replaceState({}, "", path);
  await act(async () => {
    render(<App />);
  });
}
async function guestDialog() {
  await userEvent.click(
    await screen.findByRole("button", { name: "Add guest" }),
  );
  return screen.getByRole("dialog", { name: "Add guest" });
}
async function enterName(dialog: HTMLElement, first: string, last: string) {
  await userEvent.type(within(dialog).getByLabelText("First name"), first);
  await userEvent.type(within(dialog).getByLabelText("Last name"), last);
}
async function navigate(path: string) {
  await act(async () => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

describe("guest and room workflows", () => {
  it("keeps an open recovery check read-only when another Owner restores the room and reconnect refreshes it", async () => {
    rooms.set(7, { ...roomFixture, active: false, version: 1 });
    await mount("/rooms/7?from=2030-02-01&to=2030-02-03");
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Check interrupted maintenance save",
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Check interrupted maintenance save",
    });
    const started = Date.now();
    try {
      onlineManager.setOnline(false);
      rooms.set(7, { ...roomFixture, active: true, version: 2 });
      vi.setSystemTime(started + 31_000);
      await act(async () => {
        onlineManager.setOnline(true);
      });
      await waitFor(() =>
        expect(calls("/api/v1/apartments/7", "GET")).toHaveLength(2),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: "Restore room" }),
        ).not.toBeInTheDocument(),
      );
      expect(
        screen.getByRole("dialog", {
          name: "Check interrupted maintenance save",
        }),
      ).toBe(dialog);
      expect(
        within(dialog).queryByRole("button", { name: "Save maintenance" }),
      ).not.toBeInTheDocument();
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Check saved result" }),
      );
      await within(dialog).findByText(
        /No pending maintenance request matches these details/,
      );
      expect(calls("/api/v1/apartments/7/maintenance", "POST")).toHaveLength(0);
      expect(blocks).toHaveLength(0);
    } finally {
      vi.setSystemTime(started);
      onlineManager.setOnline(true);
    }
  });
  it("keeps guest drafts with their own record when browser Back changes the profile", async () => {
    guests.set(6, {
      ...guestFixture,
      id: 6,
      firstName: "Second",
      lastName: "Person",
    });
    await mount("/guests/5");
    await screen.findByRole("heading", { name: "Test Guest" });
    await navigate("/guests/6");
    await screen.findByRole("heading", { name: "Second Person" });
    await userEvent.click(screen.getByRole("button", { name: "Edit guest" }));
    const edit = screen.getByRole("dialog", { name: "Edit guest" });
    await userEvent.clear(within(edit).getByLabelText("First name"));
    await userEvent.type(
      within(edit).getByLabelText("First name"),
      "UnsavedSecond",
    );
    await act(async () => {
      window.history.back();
    });
    await screen.findByRole("heading", { name: "Test Guest" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit guest" }));
    expect(
      within(screen.getByRole("dialog")).getByLabelText("First name"),
    ).toHaveValue("Test");
    expect(calls("/api/v1/customers/5", "PUT")).toHaveLength(0);
    await act(async () => {
      window.history.forward();
    });
    await screen.findByRole("heading", { name: "Second Person" });
    await userEvent.click(screen.getByRole("button", { name: "Edit guest" }));
    expect(
      within(screen.getByRole("dialog")).getByLabelText("First name"),
    ).toHaveValue("UnsavedSecond");
    expect(guests.get(5)?.firstName).toBe("Test");
  });
  it("resets room dialogs on navigation while keeping edit and maintenance drafts under their room", async () => {
    rooms.set(8, {
      ...roomFixture,
      id: 8,
      name: "Second studio",
      reference: "SECOND-1",
    });
    await mount("/rooms/7");
    await screen.findByRole("heading", { name: "Garden studio" });
    await navigate("/rooms/8");
    await screen.findByRole("heading", { name: "Second studio" });
    await userEvent.click(screen.getByRole("button", { name: "Edit room" }));
    let dialog = screen.getByRole("dialog");
    await userEvent.clear(within(dialog).getByLabelText("Room name"));
    await userEvent.type(
      within(dialog).getByLabelText("Room name"),
      "Draft for second room",
    );
    await act(async () => {
      window.history.back();
    });
    await screen.findByRole("heading", { name: "Garden studio" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Block for maintenance" }),
    );
    dialog = screen.getByRole("dialog");
    await userEvent.clear(within(dialog).getByLabelText("Reason"));
    await userEvent.type(
      within(dialog).getByLabelText("Reason"),
      "First room repair",
    );
    await navigate("/rooms/8");
    await screen.findByRole("heading", { name: "Second studio" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Block for maintenance" }),
    );
    expect(
      within(screen.getByRole("dialog")).getByLabelText("Reason"),
    ).toHaveValue("Maintenance");
    await act(async () => {
      window.history.back();
    });
    await screen.findByRole("heading", { name: "Garden studio" });
    await userEvent.click(screen.getByRole("button", { name: "Edit room" }));
    expect(
      within(screen.getByRole("dialog")).getByLabelText("Room name"),
    ).toHaveValue("Garden studio");
    expect(calls("/api/v1/apartments/7", "PUT")).toHaveLength(0);
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Close dialog",
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Block for maintenance" }),
    );
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Reason")).toHaveValue(
      "First room repair",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save maintenance" }),
    );
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(blocks[0]).toMatchObject({ roomId: 7, reason: "First room repair" });
  });
  it("remounts a linked guest booking intent and restores only that guest's draft", async () => {
    guests.set(6, {
      ...guestFixture,
      id: 6,
      firstName: "Second",
      lastName: "Person",
    });
    await mount("/reservations/new?guest=5");
    const picker = await screen.findByRole("combobox", { name: "Guest" });
    await waitFor(() => expect(picker).toHaveValue("Test Guest"));
    await userEvent.clear(screen.getByLabelText("Check-in"));
    await userEvent.type(screen.getByLabelText("Check-in"), "2031-01-01");
    await navigate("/reservations/new?guest=6");
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Guest" })).toHaveValue(
        "Second Person",
      ),
    );
    expect(screen.getByLabelText("Check-in")).not.toHaveValue("2031-01-01");
    await act(async () => {
      window.history.back();
    });
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Guest" })).toHaveValue(
        "Test Guest",
      ),
    );
    expect(screen.getByLabelText("Check-in")).toHaveValue("2031-01-01");
    expect(calls("/api/v1/reservations", "POST")).toHaveLength(0);
  });
  it("distinguishes same-name guests with optional or shared contacts before selection", async () => {
    guests = new Map([
      [
        5,
        {
          ...guestFixture,
          firstName: "Alex",
          lastName: "Jones",
          phone: null,
          email: "first@example.test",
        },
      ],
      [
        6,
        {
          ...guestFixture,
          id: 6,
          firstName: "Alex",
          lastName: "Jones",
          phone: null,
          email: "second@example.test",
        },
      ],
      [
        7,
        {
          ...guestFixture,
          id: 7,
          firstName: "Alex",
          lastName: "Jones",
          phone: null,
          email: "second@example.test",
        },
      ],
      [
        8,
        {
          ...guestFixture,
          id: 8,
          firstName: "Alex",
          lastName: "Jones",
          phone: null,
          email: null,
        },
      ],
    ]);
    await mount("/reservations/new");
    await userEvent.type(
      await screen.findByRole("combobox", { name: "Guest" }),
      "Alex Jones",
    );
    const list = await screen.findByRole("listbox", {
      name: "Matching guests",
    });
    await waitFor(() =>
      expect(within(list).getAllByRole("option")).toHaveLength(4),
    );
    const options = within(list).getAllByRole("option");
    expect(new Set(options.map((option) => option.textContent)).size).toBe(4);
    expect(options[0]).toHaveTextContent("first@example.test");
    expect(options[3]).toHaveTextContent("No contact details");
    await userEvent.click(
      within(list).getByRole("option", {
        name: /second@example.test Guest #7/,
      }),
    );
    expect(
      screen.getByRole("link", { name: "View selected guest #7" }),
    ).toHaveAttribute("href", "/guests/7");
    expect(window.location.search).toBe("");
  });
  it("checks an interrupted maintenance save after archival and reload without restoring or writing again", async () => {
    api.mockImplementation(async (input, init) => {
      const response = await responses(input, init);
      if (parsed(input).pathname === "/api/v1/apartments/7/maintenance") {
        rooms.set(7, { ...rooms.get(7)!, active: false, version: 1 });
        throw new TypeError("Lost maintenance response");
      }
      return response;
    });
    await mount("/rooms/7?from=2030-02-01&to=2030-02-03");
    await userEvent.click(
      await screen.findByRole("button", { name: "Block for maintenance" }),
    );
    let dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save maintenance" }),
    );
    await within(dialog).findByText(/The result could not be confirmed/);
    cleanup();
    await mount("/rooms/7?from=2030-02-01&to=2030-02-03");
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Check interrupted maintenance save",
      }),
    );
    dialog = screen.getByRole("dialog", {
      name: "Check interrupted maintenance save",
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Check saved result" }),
    );
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await screen.findByText(/Maintenance #30 is saved/);
    expect(blocks).toHaveLength(1);
    expect(calls("/api/v1/apartments/7/maintenance", "POST")).toHaveLength(1);
    expect(calls("/api/v1/apartments/7/status", "POST")).toHaveLength(0);
    expect(rooms.get(7)!.active).toBe(false);
  });
  it("cannot create new maintenance from an archived room's recovery form", async () => {
    rooms.set(7, { ...roomFixture, active: false, version: 1 });
    await mount("/rooms/7");
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Check interrupted maintenance save",
      }),
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Check saved result" }),
    );
    await within(dialog).findByText(
      /No pending maintenance request matches these details/,
    );
    expect(calls("/api/v1/apartments/7/maintenance", "POST")).toHaveLength(0);
    expect(blocks).toHaveLength(0);
    expect(localStorage.getItem("villarosa.pendingOperations.v2")).toBeNull();
  });
  it("creates a walk-in using names only, keeps contacts private and clears the successful draft", async () => {
    await mount("/guests");
    const dialog = await guestDialog();
    await enterName(dialog, "Walk", "In");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save guest" }),
    );
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(guests.get(9)).toMatchObject({
      firstName: "Walk",
      lastName: "In",
      phone: null,
      address: null,
      email: null,
    });
    expect(calls("/api/v1/customers", "POST")).toHaveLength(1);
    expect(JSON.stringify(localStorage)).not.toContain("Walk");
    expect(JSON.stringify(sessionStorage)).not.toContain("Walk");
    const next = await guestDialog();
    expect(within(next).getByLabelText("First name")).toHaveValue("");
  });
  it("paginates the private directory and restarts the cursor for combined filters", async () => {
    api.mockImplementation((input, init) =>
      parsed(input).pathname === "/api/v1/customers/query"
        ? Promise.resolve(
            json({
              items: [
                {
                  ...guestFixture,
                  id: bodyOf(init).afterId ? 8 : 5,
                  firstName: bodyOf(init).afterId ? "Second" : "Test",
                },
              ],
              nextCursor: bodyOf(init).afterId ? null : 5,
            }),
          )
        : responses(input, init),
    );
    await mount("/guests");
    await userEvent.click(
      await screen.findByRole("button", { name: "Load more guests" }),
    );
    await screen.findByRole("cell", { name: "Second Guest" });
    await userEvent.type(screen.getByLabelText("Name"), "Јана Гостин");
    await userEvent.type(
      screen.getByLabelText("Phone", { exact: true }),
      "+389 70 123 456",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Search guests" }),
    );
    await waitFor(() =>
      expect(
        calls("/api/v1/customers/query", "POST").some(([, init]) => {
          const body = bodyOf(init);
          return (
            body.name === "Јана Гостин" &&
            body.phone === "+389 70 123 456" &&
            body.afterId === 0
          );
        }),
      ).toBe(true),
    );
    expect(window.location.search).toBe("");
    expect(
      api.mock.calls.every(
        ([input]) =>
          !String(input).includes("389") && !String(input).includes("Јана"),
      ),
    ).toBe(true);
  });
  it("requires explicit separate-person review instead of merging matching guests", async () => {
    api.mockImplementation((input, init) => {
      if (parsed(input).pathname === "/api/v1/customers/duplicates")
        return Promise.resolve(json([guestFixture]));
      if (
        parsed(input).pathname === "/api/v1/customers" &&
        !bodyOf(init).allowDuplicate
      )
        return Promise.resolve(json({ code: "POSSIBLE_DUPLICATE" }, 409));
      return responses(input, init);
    });
    await mount("/guests");
    const dialog = await guestDialog();
    await enterName(dialog, "Test", "Guest");
    await within(dialog).findByText("Review possible matches");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save guest" }),
    );
    await within(dialog).findByText(/A guest with this name already exists/);
    expect(guests.has(9)).toBe(false);
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: /I reviewed the matches/ }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save guest" }),
    );
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(guests.has(5) && guests.has(9)).toBe(true);
    expect(
      bodyOf(calls("/api/v1/customers", "POST")[1][1]).allowDuplicate,
    ).toBe(true);
  });
  it("creates and selects a guest inline without losing the stay or submitting a booking", async () => {
    await mount("/reservations/new");
    await screen.findByLabelText("Check-in");
    await userEvent.clear(screen.getByLabelText("Check-in", { exact: true }));
    await userEvent.type(
      screen.getByLabelText("Check-in", { exact: true }),
      "2030-01-01",
    );
    await userEvent.clear(screen.getByLabelText("Check-out", { exact: true }));
    await userEvent.type(
      screen.getByLabelText("Check-out", { exact: true }),
      "2030-01-04",
    );
    const dialog = await guestDialog();
    expect(dialog.closest("form")).toBeNull();
    await enterName(dialog, "Inline", "Visitor");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save guest" }),
    );
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(screen.getByRole("combobox", { name: "Guest" })).toHaveValue(
      "Inline Visitor",
    );
    expect(screen.getByLabelText("Check-in", { exact: true })).toHaveValue(
      "2030-01-01",
    );
    expect(calls("/api/v1/reservations", "POST")).toHaveLength(0);
  });
  it("retains stale guest edits and makes an explicit reload fetch the latest profile", async () => {
    let stale = true;
    api.mockImplementation((input, init) => {
      if (
        parsed(input).pathname === "/api/v1/customers/5" &&
        init?.method === "PUT" &&
        stale
      ) {
        stale = false;
        guests.set(5, { ...guestFixture, lastName: "Other owner", version: 1 });
        return Promise.resolve(json({ code: "STALE_VERSION" }, 409));
      }
      return responses(input, init);
    });
    await mount("/guests/5");
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit guest" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Edit guest" });
    const field = within(dialog).getByLabelText("Last name");
    await userEvent.clear(field);
    await userEvent.type(field, "Entered change");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Save changes" }),
      ).toBeDisabled(),
    );
    expect(field).toHaveValue("Entered change");
    guests.set(5, {
      ...guests.get(5)!,
      lastName: "Latest owner change",
      version: 2,
    });
    const reads = calls("/api/v1/customers/5", "GET").length;
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Load latest profile" }),
    );
    await waitFor(() => expect(field).toHaveValue("Latest owner change"));
    expect(calls("/api/v1/customers/5", "GET").length).toBeGreaterThan(reads);
    await userEvent.clear(field);
    await userEvent.type(field, "Reviewed change");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(
      bodyOf(calls("/api/v1/customers/5", "PUT")[1][1]).expectedVersion,
    ).toBe(2);
  });
  it("keeps a reviewed room draft version through another same-Owner login", async () => {
    let stale = true;
    api.mockImplementation((input, init) => {
      if (
        parsed(input).pathname === "/api/v1/apartments/7" &&
        init?.method === "PUT" &&
        stale
      ) {
        stale = false;
        rooms.set(7, { ...roomFixture, name: "Latest studio", version: 1 });
        return Promise.resolve(json({ code: "STALE_VERSION" }, 409));
      }
      return responses(input, init);
    });
    await mount("/rooms/7");
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit room" }),
    );
    let dialog = screen.getByRole("dialog", { name: "Edit room" });
    await userEvent.clear(within(dialog).getByLabelText("Room name"));
    await userEvent.type(
      within(dialog).getByLabelText("Room name"),
      "My draft",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Save changes" }),
      ).toBeDisabled(),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Load latest room" }),
    );
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Room name")).toHaveValue(
        "Latest studio",
      ),
    );
    generation = "five-login-two";
    await act(async () => {
      await refreshSession({ explicit: true });
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit room" }),
    );
    dialog = screen.getByRole("dialog", { name: "Edit room" });
    expect(
      within(dialog).getByRole("button", { name: "Save changes" }),
    ).toBeEnabled();
    expect(within(dialog).getByLabelText("Room name")).toHaveValue(
      "Latest studio",
    );
    expect(calls("/api/v1/apartments/7", "PUT")).toHaveLength(1);
  });
  it("shows safe conflict links and keeps archive failures open", async () => {
    api.mockImplementation((input, init) =>
      parsed(input).pathname === "/api/v1/customers/5/status"
        ? Promise.resolve(
            json(
              {
                code: "GUEST_HAS_BOOKINGS",
                relatedReservationIds: [42],
                moreReservations: true,
              },
              409,
            ),
          )
        : responses(input, init),
    );
    await mount("/guests/5");
    await userEvent.click(
      await screen.findByRole("button", { name: "Archive guest" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Archive guest?" });
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: "Archive guest",
      }),
    );
    expect(
      await within(dialog).findByRole("link", { name: "Reservation #42" }),
    ).toHaveAttribute("href", "/reservations/42");
    expect(guests.get(5)!.active).toBe(true);
    expect(calls("/api/v1/customers/5/status", "POST")).toHaveLength(1);
  });
  it("rejects fractional capacities in the form without making a room write", async () => {
    await mount("/rooms/7");
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit room" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Edit room" });
    await userEvent.clear(within(dialog).getByLabelText("Capacity"));
    await userEvent.type(within(dialog).getByLabelText("Capacity"), "1.5");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    expect(
      await within(dialog).findByText("Use a whole number."),
    ).toBeInTheDocument();
    expect(calls("/api/v1/apartments/7", "PUT")).toHaveLength(0);
  });
  it("distinguishes rooms with the same name and capacity by their stable references", async () => {
    rooms.set(8, { ...roomFixture, id: 8, reference: "GARDEN-2" });
    await mount("/reservations/new");
    expect(
      await screen.findByRole("option", {
        name: "Garden studio · GARDEN-1 · up to 4 guests",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", {
        name: "Garden studio · GARDEN-2 · up to 4 guests",
      }),
    ).toBeInTheDocument();
  });
  it("creates a named room and opens its detail page without inventing rates", async () => {
    await mount("/rooms");
    await userEvent.click(
      await screen.findByRole("button", { name: "Add room" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Add room" });
    await userEvent.type(
      within(dialog).getByLabelText("Room name"),
      "Lake suite",
    );
    await userEvent.type(within(dialog).getByLabelText("Reference"), "LAKE-1");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save room" }),
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Lake suite" }),
    ).toBeInTheDocument();
    const body = bodyOf(calls("/api/v1/apartments", "POST")[0][1]);
    expect(body).not.toHaveProperty("regularPrice");
    expect(body).not.toHaveProperty("topSeasonPrice");
    expect(window.location.pathname).toBe("/rooms/8");
  });
  it("recovers from a maintenance conflict, then cancels the retained block", async () => {
    let conflict = true;
    api.mockImplementation((input, init) => {
      if (
        parsed(input).pathname === "/api/v1/apartments/7/maintenance" &&
        conflict
      ) {
        conflict = false;
        return Promise.resolve(json({ code: "INVENTORY_CONFLICT" }, 409));
      }
      return responses(input, init);
    });
    await mount("/rooms/7?from=2030-01-01&to=2030-01-10");
    await userEvent.click(
      await screen.findByRole("button", { name: "Block for maintenance" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Block for maintenance",
    });
    await userEvent.clear(within(dialog).getByLabelText("Reason"));
    await userEvent.type(
      within(dialog).getByLabelText("Reason"),
      "Synthetic repair",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save maintenance" }),
    );
    await within(dialog).findByText(/That room is no longer available/);
    await userEvent.clear(within(dialog).getByLabelText("Start date"));
    await userEvent.type(
      within(dialog).getByLabelText("Start date"),
      "2030-01-10",
    );
    await userEvent.clear(within(dialog).getByLabelText("End date"));
    await userEvent.type(
      within(dialog).getByLabelText("End date"),
      "2030-01-12",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save maintenance" }),
    );
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await screen.findByRole("button", {
      name: /Cancel block for Synthetic repair/,
    });
    expect(window.location.search).not.toContain("Synthetic");
    expect(JSON.stringify(localStorage)).not.toContain("Synthetic repair");
    await userEvent.click(
      screen.getByRole("button", { name: /Cancel block for Synthetic repair/ }),
    );
    const cancel = screen.getByRole("dialog", { name: "Cancel maintenance?" });
    await userEvent.click(
      within(cancel).getByRole("button", {
        name: "Confirm maintenance cancellation",
      }),
    );
    await waitFor(() => expect(cancel).not.toBeInTheDocument());
    expect(
      await screen.findByText("Cancelled", { exact: true }),
    ).toBeInTheDocument();
    expect(blocks).toHaveLength(1);
  });
  it("reconciles a lost maintenance response without sending a second block creation", async () => {
    let lost = true;
    api.mockImplementation(async (input, init) => {
      const response = await responses(input, init);
      if (
        parsed(input).pathname === "/api/v1/apartments/7/maintenance" &&
        lost
      ) {
        lost = false;
        throw new TypeError("Lost response");
      }
      return response;
    });
    await mount("/rooms/7?from=2030-02-01&to=2030-02-03");
    await userEvent.click(
      await screen.findByRole("button", { name: "Block for maintenance" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Block for maintenance",
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save maintenance" }),
    );
    await within(dialog).findByText(/The result could not be confirmed/);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save maintenance" }),
    );
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(calls("/api/v1/apartments/7/maintenance", "POST")).toHaveLength(1);
    expect(blocks).toHaveLength(1);
  });
  it("keeps malformed status successes unconfirmed and never reports archival", async () => {
    api.mockImplementation((input, init) =>
      parsed(input).pathname === "/api/v1/apartments/7/status"
        ? Promise.resolve(json({ unexpected: true }))
        : responses(input, init),
    );
    await mount("/rooms/7");
    await userEvent.click(
      await screen.findByRole("button", { name: "Archive room" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Archive room?" });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Archive room" }),
    );
    expect(
      await within(dialog).findByText(/The result could not be confirmed/),
    ).toBeInTheDocument();
    expect(rooms.get(7)!.active).toBe(true);
  });
  it("does not query an invalid room window and supports explicit reset", async () => {
    await mount("/rooms/7?from=2026-02-30&to=2030-01-01");
    await screen.findByRole("button", { name: "Reset period" });
    expect(calls("/api/v1/maintenance-blocks", "GET")).toHaveLength(0);
    expect(calls("/api/v1/reservations", "GET")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Reset period" }));
    await screen.findByText("No maintenance in this period");
    expect(calls("/api/v1/maintenance-blocks", "GET")).toHaveLength(1);
  });
});
