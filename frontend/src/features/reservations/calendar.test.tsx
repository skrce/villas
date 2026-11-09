import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../../App";
import { refreshSession } from "../../api/session";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const room = {
  id: 7,
  name: "Lake room",
  reference: "LAKE",
  capacity: 4,
  active: true,
  version: 0,
};
const api = vi.fn<typeof fetch>();
let malformed = false;
let failed = false;
const response = async (url: RequestInfo | URL) => {
  const u = new URL(String(url), "http://localhost");
  if (u.pathname === "/api/v1/auth/session")
    return json({
      authenticated: true,
      propertyId: "villa-rosa",
      generation: "calendar-test-login",
      staff: {
        id: "calendar-owner",
        email: "owner@example.test",
        role: "OWNER",
        active: true,
        version: 0,
      },
      csrfToken: "test-csrf",
      expiresAt: "2099-01-01T00:00:00Z",
      permissions: ["staff:manage", "reservations:write"],
      provider: "synthetic",
    });
  if (u.pathname === "/api/v1/calendar") {
    if (failed) return json({ code: "FAILED" }, 503);
    return json({
      startDate: u.searchParams.get("startDate"),
      endDate: u.searchParams.get("endDate"),
      rooms:
        u.searchParams.has("afterRoomId") &&
        u.searchParams.get("afterRoomId") !== "0"
          ? []
          : [room],
      stays: malformed ? undefined : [],
      maintenance: [],
      nextRoomCursor: null,
    });
  }
  if (
    u.pathname === "/api/v1/apartments" ||
    u.pathname === "/api/v1/reservations/available-apartments"
  )
    return json([room]);
  if (u.pathname === "/api/v1/reservations")
    return json({ items: [], nextCursor: null });
  return json({ code: "NOT_FOUND" }, 404);
};
beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  malformed = false;
  failed = false;
  api.mockReset();
  api.mockImplementation(response);
  vi.stubGlobal("fetch", api);
  await refreshSession({ explicit: true });
});
afterEach(() => vi.unstubAllGlobals());
async function open(url = "/calendar?from=2030-01-01") {
  window.history.replaceState({}, "", url);
  await act(async () => {
    render(<App />);
  });
}
it("selects a free keyboard period and opens a draft with its room and dates", async () => {
  await open();
  const first = await screen.findByRole("button", {
    name: "Select Lake room, night of 3 Jan 2030",
  });
  first.focus();
  await userEvent.keyboard("{Enter}");
  const last = screen.getByRole("button", {
    name: "Select Lake room, night of 5 Jan 2030",
  });
  last.focus();
  await userEvent.keyboard("{Enter}");
  await userEvent.click(
    screen.getByRole("link", { name: "Create reservation" }),
  );
  await screen.findByRole("heading", { name: "New reservation" });
  await userEvent.click(
    screen.getByRole("button", { name: "Continue to room & guest" }),
  );
  expect(screen.getByLabelText("Check-in")).toHaveValue("2030-01-03");
  expect(screen.getByLabelText("Check-out")).toHaveValue("2030-01-06");
  await waitFor(() =>
    expect(screen.getByLabelText("Room", { exact: true })).toHaveValue("7"),
  );
  expect(JSON.stringify(localStorage)).not.toContain("Lake room");
});
it("does not treat a malformed or failed refresh as a free period", async () => {
  await open();
  await screen.findByRole("button", {
    name: "Select Lake room, night of 1 Jan 2030",
  });
  malformed = true;
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh calendar" }),
  );
  await screen.findByText(/Availability could not be confirmed/);
  expect(
    screen.queryByRole("button", { name: /Select Lake room/ }),
  ).not.toBeInTheDocument();
  malformed = false;
  failed = true;
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh calendar" }),
  );
  await screen.findByText(/No empty period can be selected/);
});
it("uses distinct week query keys and discards a previous week selection", async () => {
  await open();
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Select Lake room, night of 1 Jan 2030",
    }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Next week →" }));
  await screen.findByRole("button", {
    name: "Select Lake room, night of 8 Jan 2030",
  });
  expect(
    screen.queryByRole("link", { name: "Create reservation" }),
  ).not.toBeInTheDocument();
  expect(
    api.mock.calls
      .filter(([u]) => String(u).includes("/calendar?"))
      .map(([u]) =>
        new URL(String(u), "http://localhost").searchParams.get("startDate"),
      ),
  ).toEqual(["2030-01-01", "2030-01-08"]);
});
it.each([
  "/calendar?from=9999-12-31",
  "/calendar?from=2030-02-30",
  "/calendar?after=2147483648",
])(
  "rejects invalid calendar deep links without a request (%s)",
  async (url) => {
    await open(url);
    await screen.findByText(/Choose a valid starting date/);
    expect(api.mock.calls.some(([u]) => String(u).includes("/calendar?"))).toBe(
      false,
    );
  },
);
it("rejects an invalid prefilled stay instead of silently using another date", async () => {
  await open("/reservations/new?room=7&from=2030-02-30&to=2030-03-04");
  await screen.findByText(/This booking link has invalid/);
  expect(
    screen.getByRole("button", { name: "Continue to room & guest" }),
  ).toBeDisabled();
  expect(
    api.mock.calls.some(([u]) => String(u).includes("available-apartments")),
  ).toBe(false);
});
it("keeps bounded reservation room filters in the request and URL", async () => {
  await open("/reservations?from=2030-01-01&to=2030-01-08&room=7");
  await screen.findByText("No stays in this period");
  expect(
    api.mock.calls.some(
      ([u]) =>
        String(u).includes("/reservations?") &&
        new URL(String(u), "http://localhost").searchParams.get("roomId") ===
          "7",
    ),
  ).toBe(true);
  await waitFor(() =>
    expect(screen.getByLabelText("Room", { exact: true })).toHaveValue("7"),
  );
});

it("pauses free-period selection as soon as an idle cached calendar goes offline", async () => {
  await open();
  await screen.findByRole("button", {
    name: "Select Lake room, night of 1 Jan 2030",
  });
  let online = false;
  const getter = vi
    .spyOn(navigator, "onLine", "get")
    .mockImplementation(() => online);
  try {
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    await screen.findByText(/You're offline. Reconnect/);
    expect(
      screen.queryByRole("button", { name: /Select Lake room/ }),
    ).not.toBeInTheDocument();
    online = true;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await screen.findByRole("button", {
      name: "Select Lake room, night of 1 Jan 2030",
    });
  } finally {
    getter.mockRestore();
  }
});

it("retains the selected room label when metadata fails instead of showing all rooms", async () => {
  api.mockImplementation((url) =>
    new URL(String(url), "http://localhost").pathname === "/api/v1/apartments"
      ? Promise.resolve(json({ code: "FAILED" }, 503))
      : response(url),
  );
  await open("/reservations?from=2030-01-01&to=2030-01-08&room=7");
  await screen.findByText(/Room names could not be loaded/);
  expect(screen.getByLabelText("Room", { exact: true })).toHaveValue("7");
  expect(
    screen.getByRole("option", { selected: true, name: /Room #7/ }),
  ).toBeInTheDocument();
});

it("opens a maintenance block in its selected historical period with a real anchor", async () => {
  api.mockImplementation((url) => {
    const u = new URL(String(url), "http://localhost");
    if (u.pathname === "/api/v1/calendar")
      return Promise.resolve(
        json({
          startDate: "2030-01-01",
          endDate: "2030-01-08",
          rooms: [room],
          stays: [],
          maintenance: [
            {
              id: 9,
              roomId: 7,
              startDate: "2030-01-02",
              endDate: "2030-01-04",
              reason: "Historical repair",
              version: 0,
              status: "ACTIVE",
            },
          ],
          nextRoomCursor: null,
        }),
      );
    if (u.pathname === "/api/v1/apartments/7")
      return Promise.resolve(json(room));
    if (u.pathname === "/api/v1/maintenance-blocks")
      return Promise.resolve(json({ items: [], nextCursor: null }));
    return response(url);
  });
  await open();
  const links = await screen.findAllByRole("link", {
    name: /Historical repair/,
  });
  for (const link of links)
    expect(link).toHaveAttribute(
      "href",
      "/rooms/7?from=2030-01-01&to=2030-01-08&history=1#maintenance",
    );
  await userEvent.click(links[0]);
  await screen.findByRole("heading", { name: "Availability & maintenance" });
  expect(document.getElementById("maintenance")).toBeInTheDocument();
  expect(
    api.mock.calls.some(
      ([u]) =>
        String(u).includes("/maintenance-blocks?") &&
        new URL(String(u), "http://localhost").searchParams.get("startDate") ===
          "2030-01-01",
    ),
  ).toBe(true);
});
