import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { refreshSession } from "../../api/session";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const initial = {
  roomId: 7,
  currency: "EUR",
  baseNightlyCents: null as number | null,
  version: 0,
  seasons: [] as {
    name: string;
    startDate: string;
    endDate: string;
    nightlyCents: number;
  }[],
};
let rates: typeof initial;
let authenticated: boolean;
let generation: string;
const api = vi.fn<typeof fetch>();
const bodyOf = (init?: RequestInit) => JSON.parse(String(init?.body ?? "{}"));
const pathOf = (input: RequestInfo | URL) =>
  new URL(String(input), "http://localhost").pathname;
const writes = () =>
  api.mock.calls.filter(
    ([input, init]) =>
      pathOf(input) === "/api/v1/apartments/7/rates" && init?.method === "PUT",
  );
const reads = () =>
  api.mock.calls.filter(
    ([input, init]) =>
      pathOf(input) === "/api/v1/apartments/7/rates" &&
      (init?.method ?? "GET") === "GET",
  );
async function response(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const path = pathOf(input);
  if (path === "/api/v1/auth/session")
    return json({
      authenticated,
      propertyId: "villa-rosa",
      generation,
      staff: {
        id: "rate-owner",
        email: "owner@example.test",
        role: "OWNER",
        active: true,
        version: 0,
      },
      csrfToken: "test-csrf",
      expiresAt: "2099-01-01T00:00:00Z",
      permissions: ["rates:read", "rates:write", "rooms:write"],
      provider: "synthetic",
    });
  if (path === "/api/v1/apartments/7/rates") {
    if ((init?.method ?? "GET") === "GET") return json(rates);
    const body = bodyOf(init);
    if (body.expectedVersion !== rates.version)
      return json({ code: "STALE_VERSION" }, 409);
    rates = {
      ...rates,
      baseNightlyCents: body.baseNightlyCents,
      seasons: body.seasons,
      version: rates.version + 1,
    };
    return json(rates);
  }
  if (path === "/api/v1/apartments/7")
    return json({
      id: 7,
      name: "Garden studio",
      reference: "GARDEN-1",
      capacity: 4,
      active: true,
      version: 0,
    });
  if (["/api/v1/reservations", "/api/v1/maintenance-blocks"].includes(path))
    return json({ items: [], nextCursor: null });
  return json({ code: "NOT_FOUND" }, 404);
}
beforeEach(async () => {
  rates = { ...initial, seasons: [] };
  authenticated = true;
  generation = "rate-login-one";
  localStorage.clear();
  sessionStorage.clear();
  api.mockReset();
  api.mockImplementation(response);
  vi.stubGlobal("fetch", api);
  await refreshSession({ explicit: true });
  window.history.replaceState({}, "", "/rooms/7");
  await act(async () => {
    render(<App />);
  });
});
afterEach(() => vi.unstubAllGlobals());
async function editor() {
  await userEvent.click(
    await screen.findByRole("button", { name: /Configure rates|Edit rates/ }),
  );
  return screen.getByRole("dialog", { name: "Edit nightly rates" });
}
async function price(dialog: HTMLElement, value: string) {
  const input = within(dialog).getByLabelText("Base price (EUR per night)");
  await userEvent.clear(input);
  await userEvent.type(input, value);
}
describe("Owner rate administration", () => {
  it("requires explicit configuration and saves an exact comma-decimal base price without browser persistence", async () => {
    await screen.findByText("Rates need configuration");
    const dialog = await editor();
    await price(dialog, "50,01");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save rates" }),
    );
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(rates.baseNightlyCents).toBe(5001);
    expect(bodyOf(writes()[0][1])).toMatchObject({
      expectedVersion: 0,
      currency: "EUR",
      baseNightlyCents: 5001,
    });
    expect(JSON.stringify(localStorage)).not.toContain("5001");
    expect(JSON.stringify(sessionStorage)).not.toContain("5001");
    await screen.findByText("€50.01");
  });
  it("validates amounts and overlapping periods without submitting a financial write", async () => {
    const dialog = await editor();
    await price(dialog, "50.001");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save rates" }),
    );
    await within(dialog).findByText(/Enter a positive EUR amount/);
    expect(writes()).toHaveLength(0);
    await price(dialog, "50.00");
    for (let index = 0; index < 2; index++) {
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Add seasonal price" }),
      );
      const group = within(dialog).getByRole("group", {
        name: `Season ${index + 1}`,
      });
      await userEvent.type(
        within(group).getByLabelText("Season name"),
        `Period ${index + 1}`,
      );
      await userEvent.type(
        within(group).getByLabelText("Nightly price (EUR)"),
        "75.00",
      );
      await userEvent.type(
        within(group).getByLabelText("Season start"),
        "2030-07-01",
      );
      await userEvent.type(
        within(group).getByLabelText("Season end"),
        "2030-08-01",
      );
    }
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save rates" }),
    );
    await within(dialog).findByText("Seasonal periods must not overlap.");
    expect(writes()).toHaveLength(0);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Remove season 2" }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save rates" }),
    );
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(rates.seasons).toHaveLength(1);
  });
  it("retains stale entered prices until an explicit fresh read adopts the latest version", async () => {
    const dialog = await editor();
    await price(dialog, "60.01");
    rates = { ...rates, baseNightlyCents: 7001, version: 1 };
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save rates" }),
    );
    await within(dialog).findByText(/The saved rates changed/);
    expect(
      within(dialog).getByLabelText("Base price (EUR per night)"),
    ).toHaveValue("60.01");
    expect(
      within(dialog).getByRole("button", { name: "Save rates" }),
    ).toBeDisabled();
    const before = reads().length;
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Load latest rates" }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByLabelText("Base price (EUR per night)"),
      ).toHaveValue("70.01"),
    );
    expect(reads().length).toBeGreaterThan(before);
    await price(dialog, "71.01");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save rates" }),
    );
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(bodyOf(writes()[1][1]).expectedVersion).toBe(1);
  });
  it("does not confirm a structurally valid success body containing a different price", async () => {
    api.mockImplementation((input, init) =>
      pathOf(input) === "/api/v1/apartments/7/rates" && init?.method === "PUT"
        ? Promise.resolve(
            json({ ...initial, baseNightlyCents: 9999, version: 1 }),
          )
        : response(input, init),
    );
    const dialog = await editor();
    await price(dialog, "60.01");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save rates" }),
    );
    await within(dialog).findByText(/The result could not be confirmed/);
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByLabelText("Base price (EUR per night)"),
    ).toHaveValue("60.01");
    expect(writes()).toHaveLength(1);
  });
  it("keeps a failed explicit reload from erasing the entered draft", async () => {
    const dialog = await editor();
    await price(dialog, "60.01");
    api.mockImplementation((input, init) =>
      pathOf(input) === "/api/v1/apartments/7/rates" &&
      (init?.method ?? "GET") === "GET"
        ? Promise.resolve(json({ code: "HTTP_503" }, 503))
        : response(input, init),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Load latest rates" }),
    );
    await within(dialog).findByText(/The result could not be confirmed/);
    expect(
      within(dialog).getByLabelText("Base price (EUR per night)"),
    ).toHaveValue("60.01");
    expect(writes()).toHaveLength(0);
  });
  it("preserves the reviewed price version through same-Owner session recovery without submitting", async () => {
    const dialog = await editor();
    await price(dialog, "60.01");
    rates = { ...rates, baseNightlyCents: 7001, version: 1 };
    generation = "rate-login-two";
    await act(async () => {
      await refreshSession({ explicit: true });
    });
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    const next = await editor();
    expect(
      within(next).getByLabelText("Base price (EUR per night)"),
    ).toHaveValue("60.01");
    expect(
      within(next).getByRole("button", { name: "Save rates" }),
    ).toBeDisabled();
    expect(writes()).toHaveLength(0);
  });
});
