import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function signInHere(page: Page, identity = "Synthetic Owner") {
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Sign in to local demo" }).click();
  const popup = await opened;
  await popup.getByRole("button", { name: identity, exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}
async function signIn(page: Page, identity = "Synthetic Owner") {
  if (!process.env.VILLAS_LOCAL_INSTANCE?.startsWith("e2e-"))
    throw new Error("Use npm run test:e2e for a disposable database.");
  await page.goto("/");
  await signInHere(page, identity);
}
async function headersFor(page: Page) {
  const response = await page.request.get("/api/v1/auth/session");
  return {
    "X-CSRF-TOKEN": (await response.json()).csrfToken,
    Origin: "http://127.0.0.1:15073",
  };
}
async function fillBooking(
  page: Page,
  guestId: number,
  start = "2026-11-12",
  end = "2026-11-14",
  recover = false,
) {
  await page.goto(`/reservations/new?guest=${guestId}`);
  await expect(
    page.getByRole("combobox", { name: "Guest", exact: true }),
  ).not.toHaveValue("");
  await page.getByLabel("Check-in", { exact: true }).fill(start);
  await page.getByLabel("Check-out", { exact: true }).fill(end);
  await page.getByLabel("Guests", { exact: true }).fill("2");
  if (recover)
    await page
      .getByRole("checkbox", {
        name: "Include unavailable rooms for an interrupted save",
      })
      .check();
  await page.getByLabel("Room", { exact: true }).selectOption({
    label: `Synthetic lake room · South · up to 2 guests${recover ? " (not currently available)" : ""}`,
  });
}

test("an Owner creates a guest and booking, edits the stay, moves the room and cancels with persisted history", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Guests", exact: true }).click();
  await page.getByRole("button", { name: "Add guest" }).click();
  const dialog = page.getByRole("dialog", { name: "Add guest" });
  for (const [label, value] of [
    ["First name", "BrowserTest"],
    ["Last name", "Гостин"],
    ["Phone", "000"],
    ["Address", "Synthetic test record"],
  ])
    await dialog.getByLabel(label, { exact: true }).fill(value);
  await dialog.getByRole("button", { name: "Save guest" }).click();
  await page.getByRole("link", { name: "View guest details" }).click();
  const guestId = Number(new URL(page.url()).pathname.split("/").pop());
  await page
    .getByRole("link", { name: "New reservation", exact: true })
    .click();
  await page.getByLabel("Check-in", { exact: true }).fill("2026-11-06");
  await page.getByLabel("Check-out", { exact: true }).fill("2026-11-09");
  await page
    .getByLabel("Room", { exact: true })
    .selectOption({ label: "Synthetic lake room · South · up to 2 guests" });
  await page
    .getByRole("button", { name: "Create reservation", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^Reservation #\d+$/,
  );
  const reservationId = Number(new URL(page.url()).pathname.split("/").pop());
  await page.getByRole("button", { name: "Edit stay", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit stay" });
  await edit.getByLabel("Check-out", { exact: true }).fill("2026-11-10");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit).not.toBeVisible();
  await page.getByRole("button", { name: "Move room", exact: true }).click();
  const move = page.getByRole("dialog", { name: "Move room" });
  await move
    .getByLabel("New room")
    .selectOption({ label: "Synthetic garden room · East" });
  await move.getByRole("button", { name: "Save changes" }).click();
  await expect(move).not.toBeVisible();
  const saved = await page.request.get(`/api/v1/reservations/${reservationId}`);
  expect(await saved.json()).toMatchObject({
    customerId: guestId,
    endDate: "2026-11-10",
    version: 2,
    nights: 4,
  });
  await page
    .getByRole("button", { name: "Cancel reservation", exact: true })
    .click();
  const cancel = page.getByRole("dialog", { name: "Cancel reservation?" });
  await cancel.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(cancel).not.toBeVisible();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  expect(
    await (
      await page.request.get(`/api/v1/reservations/${reservationId}`)
    ).json(),
  ).toMatchObject({ status: "CANCELLED", version: 3 });
  const history = await page.request.get(
    `/api/v1/reservations/${reservationId}/events`,
  );
  expect((await history.json()).items).toHaveLength(4);
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  for (const value of ["BrowserTest", "Гостин", "Synthetic test record"])
    expect(stored).not.toContain(value);
});

test("separate tabs reconcile a lost booking response with the same durable key", async ({
  page,
  context,
}) => {
  await signIn(page);
  const headers = await headersFor(page);
  const guest = await page.request.post("/api/v1/customers", {
    headers,
    data: {
      firstName: "TabTest",
      lastName: "Synthetic",
      phone: "000",
      address: "Synthetic",
    },
  });
  expect(guest.ok()).toBeTruthy();
  const id = await guest.json();
  await fillBooking(page, id);
  const other = await context.newPage();
  await fillBooking(other, id);
  let release = () => {};
  const allowed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = () => {};
  const inFlight = new Promise<void>((resolve) => {
    started = resolve;
  });
  const keys: string[] = [];
  await page.route("**/api/v1/reservations?**", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    started();
    await allowed;
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    await route.abort("failed");
  });
  await other.route("**/api/v1/reservations?**", async (route) => {
    if (route.request().method() === "POST") {
      keys.push(route.request().headers()["idempotency-key"]);
      release();
    }
    await route.continue();
  });
  try {
    await page
      .getByRole("button", { name: "Create reservation", exact: true })
      .click();
    await inFlight;
    await other
      .getByRole("button", { name: "Create reservation", exact: true })
      .click();
    await expect(other.getByRole("heading", { level: 1 })).toHaveText(
      /^Reservation #\d+$/,
    );
    await expect(
      page.getByText(/The result could not be confirmed/),
    ).toBeVisible();
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(1);
    const rows = await page.request.get("/api/v1/reservations/customer", {
      params: { customerId: id },
    });
    expect(await rows.json()).toEqual([
      expect.objectContaining({ guestCount: 2, nights: 2 }),
    ]);
    await fillBooking(page, id, "2026-11-12", "2026-11-14", true);
    await page
      .getByRole("button", { name: "Create reservation", exact: true })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /^Reservation #\d+$/,
    );
    expect(keys).toHaveLength(2);
    const storage = await page.evaluate(() => JSON.stringify(localStorage));
    expect(storage).not.toContain("TabTest");
    expect(storage).not.toContain("2026-11-12");
  } finally {
    release();
    await other.close();
  }
});

test("logout removes legacy credentials and clears another tab", async ({
  page,
  context,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("villarosa.apiConfig", '{"password":"obsolete"}'),
  );
  await signIn(page);
  const other = await context.newPage();
  await other.goto("/rooms");
  await expect(
    other.getByRole("heading", { name: "Rooms", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("villarosa.apiConfig")),
  ).toBeNull();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("button", { name: "Sign in to local demo" }),
  ).toBeVisible();
  await expect(
    other.getByRole("button", { name: "Sign in to local demo" }),
  ).toBeVisible();
  expect((await page.request.get("/api/v1/apartments")).status()).toBe(401);
});

test("deep links, keyboard dialogs and accessible layouts work at desktop and 320 pixels", async ({
  page,
}, testInfo) => {
  await signIn(page);
  await page.goto(
    "/reservations?from=2026-11-01&to=2026-12-01&status=CANCELLED",
  );
  await expect(page.getByLabel("From", { exact: true })).toHaveValue(
    "2026-11-01",
  );
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue(
    "CANCELLED",
  );
  await expect(page.getByRole("table")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await testInfo.attach("desktop-reservations", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await page.getByRole("link", { name: "Guests", exact: true }).click();
  const add = page.getByRole("button", { name: "Add guest" });
  await add.click();
  const dialog = page.getByRole("dialog", { name: "Add guest" });
  await dialog.getByLabel("First name").focus();
  await page.keyboard.press("Shift+Tab");
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(add).toBeFocused();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("link", { name: "Rooms", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic lake room · South" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await testInfo.attach("phone-rooms", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await page.goto(
    "/reservations?from=2026-11-01&to=2026-12-01&status=CANCELLED",
  );
  const view = page.getByRole("link", { name: /View reservation/ }).first();
  await expect(view).toBeVisible();
  const bounds = await view.boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await testInfo.attach("phone-reservations", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await page.getByRole("link", { name: /New reservation/ }).click();
  await expect(
    page.getByRole("button", { name: "Create reservation" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("Owner invitations support another Google identity and self session revocation", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Owner settings" }).click();
  await page
    .getByLabel("Google account email")
    .fill("second-owner@example.test");
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(
    page.getByText("Invitation saved.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await signInHere(page, "Second synthetic Owner");
  await expect(
    page
      .getByRole("banner")
      .getByText("second-owner@example.test", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Owner settings" }).click();
  await page
    .getByRole("button", {
      name: "Revoke sessions for second-owner@example.test",
    })
    .click();
  await page
    .getByRole("dialog", { name: "Revoke sessions?" })
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sign in to local demo" }),
  ).toBeVisible();
  expect((await page.request.get("/api/v1/apartments")).status()).toBe(401);
});

test("session revocation preserves entered booking details and never resubmits after sign-in", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/reservations/new");
  await page
    .getByRole("combobox", { name: "Guest", exact: true })
    .fill("Retained input");
  const session = await (await page.request.get("/api/v1/auth/session")).json();
  const revoke = await page.request.post(
    `/api/v1/staff/${session.staff.id}/revoke-sessions`,
    {
      headers: await headersFor(page),
      data: { expectedVersion: session.staff.version },
    },
  );
  expect(revoke.ok()).toBeTruthy();
  let writes = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().includes("/api/v1/reservations?")
    )
      writes++;
  });
  await page.getByLabel("Check-in", { exact: true }).fill("2027-01-05");
  await page.getByLabel("Check-out", { exact: true }).fill("2027-01-07");
  await expect(
    page.getByRole("button", { name: "Sign in to local demo" }),
  ).toBeVisible();
  await signInHere(page);
  await expect(
    page.getByRole("combobox", { name: "Guest", exact: true }),
  ).toHaveValue("Retained input");
  expect(writes).toBe(0);
});
