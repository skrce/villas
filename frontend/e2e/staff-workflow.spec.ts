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
    label: `Synthetic lake room · South · DEMO-LAKE · up to 2 guests${recover ? " (not currently available)" : ""}`,
  });
}

async function reviewAndConfirm(page: Page) {
  await page.getByRole("button", { name: "Review price", exact: true }).click();
  await page.getByRole("button", { name: /^Confirm reservation ·/ }).click();
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
  await page.getByLabel("Room", { exact: true }).selectOption({
    label: "Synthetic lake room · South · DEMO-LAKE · up to 2 guests",
  });
  await reviewAndConfirm(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^Reservation #\d+$/,
  );
  const reservationId = Number(new URL(page.url()).pathname.split("/").pop());
  await page.getByRole("button", { name: "Edit stay", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit stay" });
  await edit.getByLabel("Check-out", { exact: true }).fill("2026-11-10");
  await edit.getByRole("button", { name: "Review price", exact: true }).click();
  await edit.getByRole("button", { name: /^Confirm changes ·/ }).click();
  await expect(edit).not.toBeVisible();
  await page.getByRole("button", { name: "Move room", exact: true }).click();
  const move = page.getByRole("dialog", { name: "Move room" });
  await move
    .getByLabel("New room")
    .selectOption({ label: "Synthetic garden room · East · DEMO-GARDEN" });
  await move.getByRole("button", { name: "Review price", exact: true }).click();
  await move.getByRole("button", { name: /^Confirm changes ·/ }).click();
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
  const agreements = await (
    await page.request.get(`/api/v1/reservations/${reservationId}/prices`)
  ).json();
  expect(
    agreements.items.map(
      (value: {
        reservationVersion: number;
        quote: { price: { totalCents: number } };
      }) => [value.reservationVersion, value.quote.price.totalCents],
    ),
  ).toEqual([
    [2, 24004],
    [1, 20004],
    [0, 15003],
  ]);
  const accepted = await (
    await page.request.get(`/api/v1/reservations/${reservationId}/price`)
  ).json();
  expect(accepted).toMatchObject({
    recorded: true,
    price: { reservationVersion: 2, quote: { price: { totalCents: 24004 } } },
  });
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
  await page.getByRole("button", { name: "Review price", exact: true }).click();
  await other
    .getByRole("button", { name: "Review price", exact: true })
    .click();
  let release = () => {};
  const allowed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = () => {};
  const inFlight = new Promise<void>((resolve) => {
    started = resolve;
  });
  const keys: string[] = [];
  await page.route("**/api/v1/reservations/quoted", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    started();
    await allowed;
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    await route.abort("failed");
  });
  await other.route("**/api/v1/reservations/quoted", async (route) => {
    if (route.request().method() === "POST") {
      keys.push(route.request().headers()["idempotency-key"]);
      release();
    }
    await route.continue();
  });
  try {
    await page.getByRole("button", { name: /^Confirm reservation ·/ }).click();
    await inFlight;
    await other.getByRole("button", { name: /^Confirm reservation ·/ }).click();
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
      .getByRole("button", { name: "Check previous save", exact: true })
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
  const headers = await headersFor(page);
  const roomResponse = await page.request.post("/api/v1/apartments", {
    headers,
    data: {
      name: "Synthetic accessibility room",
      reference: "ACCESS-6",
      capacity: 2,
    },
  });
  expect(roomResponse.ok()).toBeTruthy();
  const room = await roomResponse.json();
  expect(
    (
      await page.request.put(`/api/v1/apartments/${room.id}/rates`, {
        headers,
        data: {
          expectedVersion: 0,
          currency: "EUR",
          baseNightlyCents: 5001,
          seasons: [],
        },
      })
    ).ok(),
  ).toBeTruthy();
  const guestResponse = await page.request.post("/api/v1/customers", {
    headers,
    data: { firstName: "Synthetic", lastName: "Accessibility" },
  });
  expect(guestResponse.ok()).toBeTruthy();
  const customerId = await guestResponse.json();
  const stay = {
    roomId: room.id,
    startDate: "2026-11-20",
    endDate: "2026-11-22",
    guestCount: 1,
  };
  const offered = await page.request.post("/api/v1/booking-quotes", {
    headers,
    data: stay,
  });
  expect(offered.ok()).toBeTruthy();
  const quote = await offered.json();
  const confirmed = await page.request.post("/api/v1/reservations/quoted", {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: { ...stay, customerId, quoteId: quote.id },
  });
  expect(confirmed.ok()).toBeTruthy();
  const id = await confirmed.json();
  expect(
    (
      await page.request.delete(
        `/api/v1/reservations?reservationId=${id}&expectedVersion=0`,
        { headers: { ...headers, "Idempotency-Key": crypto.randomUUID() } },
      )
    ).ok(),
  ).toBeTruthy();
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
    page.getByRole("button", { name: "Review price", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("Owner invitations support another synthetic identity and self session revocation", async ({
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
      new URL(request.url()).pathname === "/api/v1/reservations/quoted"
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

test("Owner guest and room management protects stays and retains maintenance/history on desktop and phone", async ({
  page,
}, testInfo) => {
  await signIn(page);
  await page.getByRole("link", { name: "Rooms", exact: true }).click();
  await page.getByRole("button", { name: "Add room" }).click();
  const addRoom = page.getByRole("dialog", { name: "Add room" });
  await addRoom.getByLabel("Room name").fill("Synthetic courtyard studio");
  await addRoom.getByLabel("Reference").fill("COURT-3");
  await addRoom.getByLabel("Capacity", { exact: true }).fill("4");
  await addRoom
    .getByLabel("Beds", { exact: true })
    .fill("Queen and two single beds");
  await addRoom.getByRole("button", { name: "Save room" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Synthetic courtyard studio",
  );
  const roomId = Number(new URL(page.url()).pathname.split("/").pop());
  const configured = await page.request.put(
    `/api/v1/apartments/${roomId}/rates`,
    {
      headers: await headersFor(page),
      data: {
        expectedVersion: 0,
        currency: "EUR",
        baseNightlyCents: 6501,
        seasons: [],
      },
    },
  );
  expect(configured.ok()).toBeTruthy();
  await page.getByRole("button", { name: "Edit room", exact: true }).click();
  const editRoom = page.getByRole("dialog", { name: "Edit room" });
  await editRoom.getByLabel("Amenities").fill("Synthetic terrace, Wi-Fi");
  const previousRoom = await (
    await page.request.get(`/api/v1/apartments/${roomId}`)
  ).json();
  const concurrent = await page.request.put(`/api/v1/apartments/${roomId}`, {
    headers: await headersFor(page),
    data: {
      details: {
        name: previousRoom.name,
        reference: previousRoom.reference,
        capacity: previousRoom.capacity,
        bedConfiguration: previousRoom.bedConfiguration,
        features: "Synthetic concurrent edit",
      },
      expectedVersion: previousRoom.version,
    },
  });
  expect(concurrent.ok()).toBeTruthy();
  await editRoom.getByRole("button", { name: "Save changes" }).click();
  await expect(editRoom.getByRole("alert")).toContainText(
    "The saved room changed",
  );
  await expect(editRoom.getByLabel("Amenities")).toHaveValue(
    "Synthetic terrace, Wi-Fi",
  );
  await editRoom.getByRole("button", { name: "Load latest room" }).click();
  await expect(editRoom.getByLabel("Amenities")).toHaveValue(
    "Synthetic concurrent edit",
  );
  await editRoom.getByLabel("Amenities").fill("Synthetic terrace, Wi-Fi");
  await editRoom.getByRole("button", { name: "Save changes" }).click();
  await expect(editRoom).not.toBeVisible();
  await page.getByRole("link", { name: "Reservations", exact: true }).click();
  await page.getByRole("link", { name: /New reservation/ }).click();
  await page.getByLabel("Check-in", { exact: true }).fill("2031-03-01");
  await page.getByLabel("Check-out", { exact: true }).fill("2031-03-04");
  await page.getByLabel("Guests", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Add guest", exact: true }).click();
  const addGuest = page.getByRole("dialog", { name: "Add guest" });
  await addGuest.getByLabel("First name").fill("Синтетичка");
  await addGuest.getByLabel("Last name").fill("Гостинка");
  await addGuest.getByRole("button", { name: "Save guest" }).click();
  await expect(addGuest).not.toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Guest", exact: true }),
  ).toHaveValue("Синтетичка Гостинка");
  await expect(page.getByLabel("Check-in", { exact: true })).toHaveValue(
    "2031-03-01",
  );
  await page.getByLabel("Room", { exact: true }).selectOption({
    label: "Synthetic courtyard studio · COURT-3 · up to 4 guests",
  });
  await reviewAndConfirm(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^Reservation #\d+$/,
  );
  const reservationId = Number(new URL(page.url()).pathname.split("/").pop());
  await page
    .getByRole("link", { name: "Синтетичка Гостинка", exact: true })
    .click();
  const guestId = Number(new URL(page.url()).pathname.split("/").pop());
  await page.getByRole("button", { name: "Edit guest", exact: true }).click();
  const editGuest = page.getByRole("dialog", { name: "Edit guest" });
  await editGuest.getByLabel("Last name").fill("Проверка");
  await editGuest
    .getByLabel("Phone", { exact: true })
    .fill("+389\u00a0000\u202f000-000");
  await editGuest
    .getByLabel("Email", { exact: true })
    .fill("GUEST@EXAMPLE.TEST");
  await editGuest
    .getByLabel("Notes", { exact: true })
    .fill("Synthetic late arrival\nUse synthetic side entrance");
  await editGuest.getByRole("button", { name: "Save changes" }).click();
  await expect(editGuest).not.toBeVisible();
  const savedGuest = await (
    await page.request.get(`/api/v1/customers/${guestId}`)
  ).json();
  expect(savedGuest).toMatchObject({
    lastName: "Проверка",
    phone: "+389000000000",
    email: "guest@example.test",
    version: 1,
  });
  await page
    .getByRole("button", { name: "Archive guest", exact: true })
    .click();
  const archiveGuest = page.getByRole("dialog", { name: "Archive guest?" });
  await archiveGuest
    .getByRole("button", { name: "Archive guest", exact: true })
    .click();
  await expect(
    archiveGuest.getByRole("link", { name: `Reservation #${reservationId}` }),
  ).toBeVisible();
  await archiveGuest.getByRole("button", { name: "Keep active" }).click();
  await page.goto(`/rooms/${roomId}?from=2031-03-01&to=2031-03-10`);
  await page.getByRole("button", { name: "Edit room", exact: true }).click();
  const capacity = page.getByRole("dialog", { name: "Edit room" });
  await capacity.getByLabel("Capacity", { exact: true }).fill("2");
  await capacity.getByRole("button", { name: "Save changes" }).click();
  await expect(
    capacity.getByRole("link", { name: `Reservation #${reservationId}` }),
  ).toBeVisible();
  expect(
    (await (await page.request.get(`/api/v1/apartments/${roomId}`)).json())
      .capacity,
  ).toBe(4);
  await capacity.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Block for maintenance", exact: true })
    .click();
  const maintenance = page.getByRole("dialog", {
    name: "Block for maintenance",
  });
  await maintenance.getByLabel("Start date").fill("2031-03-02");
  await maintenance.getByLabel("End date").fill("2031-03-03");
  await maintenance.getByLabel("Reason").fill("Synthetic plumbing repair");
  await maintenance.getByRole("button", { name: "Save maintenance" }).click();
  await expect(maintenance.getByRole("alert")).toContainText(
    "That room is no longer available",
  );
  await maintenance.getByLabel("Start date").fill("2031-03-04");
  await maintenance.getByLabel("End date").fill("2031-03-06");
  await maintenance.getByRole("button", { name: "Save maintenance" }).click();
  await expect(maintenance).not.toBeVisible();
  await page
    .getByRole("button", {
      name: "History for Synthetic plumbing repair",
      exact: true,
    })
    .click();
  const events = page.getByRole("dialog", { name: "Maintenance history" });
  await expect(events.getByText("Room blocked", { exact: true })).toBeVisible();
  await events.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", {
      name: "Cancel block for Synthetic plumbing repair",
      exact: true,
    })
    .click();
  const cancelBlock = page.getByRole("dialog", { name: "Cancel maintenance?" });
  await cancelBlock
    .getByRole("button", { name: "Confirm maintenance cancellation" })
    .click();
  await expect(cancelBlock).not.toBeVisible();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  await page.goto(`/reservations/${reservationId}`);
  await page
    .getByRole("button", { name: "Cancel reservation", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Cancel reservation?" })
    .getByRole("button", { name: "Confirm cancellation" })
    .click();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Guests", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("проверка синтетичка");
  await page.getByLabel("Phone", { exact: true }).fill("000 000");
  await page
    .getByRole("button", { name: "Search guests", exact: true })
    .click();
  await page
    .getByRole("link", { name: "View guest Синтетичка Проверка", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Reservation history", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Archive guest", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Archive guest?" })
    .getByRole("button", { name: "Archive guest", exact: true })
    .click();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Restore guest", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Restore guest?" })
    .getByRole("button", { name: "Restore guest", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "New reservation", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const guestImage = testInfo.outputPath("guests-phone.png");
  await page.screenshot({ path: guestImage, fullPage: true });
  await testInfo.attach("Guest profile at 320px", {
    path: guestImage,
    contentType: "image/png",
  });
  await page.goto(`/rooms/${roomId}?from=2031-03-01&to=2031-03-10&history=1`);
  await page.getByRole("button", { name: "Archive room", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Archive room?" })
    .getByRole("button", { name: "Archive room", exact: true })
    .click();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Block for maintenance", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Restore room", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Restore room?" })
    .getByRole("button", { name: "Restore room", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Block for maintenance", exact: true }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const roomPhone = testInfo.outputPath("room-phone.png");
  await page.screenshot({ path: roomPhone, fullPage: true });
  await testInfo.attach("Room management at 320px", {
    path: roomPhone,
    contentType: "image/png",
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  const roomDesktop = testInfo.outputPath("room-desktop.png");
  await page.screenshot({ path: roomDesktop, fullPage: true });
  await testInfo.attach("Room management desktop", {
    path: roomDesktop,
    contentType: "image/png",
  });
});

test("guest duplicate review keeps family contacts separate and the directory paginates real data", async ({
  page,
}) => {
  await signIn(page);
  const createFamily = async (first: string, separate = false) => {
    await page.goto("/guests");
    await page.getByRole("button", { name: "Add guest", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add guest" });
    await dialog.getByLabel("First name").fill(first);
    await dialog.getByLabel("Last name").fill("Synthetic family");
    await dialog.getByLabel("Phone", { exact: true }).fill("000000");
    if (separate) {
      await dialog.getByRole("button", { name: "Save guest" }).click();
      await expect(dialog.getByRole("alert")).toContainText(
        "A guest with this name already exists",
      );
      await dialog
        .getByRole("checkbox", { name: /I reviewed the matches/ })
        .check();
    }
    await dialog.getByRole("button", { name: "Save guest" }).click();
    await expect(dialog).not.toBeVisible();
    await page
      .getByRole("link", { name: "View guest details", exact: true })
      .click();
    return Number(new URL(page.url()).pathname.split("/").pop());
  };
  const first = await createFamily("Family A");
  const second = await createFamily("Family B");
  const distinct = await createFamily("Family B", true);
  expect(new Set([first, second, distinct]).size).toBe(3);
  const headers = await headersFor(page);
  for (let index = 0; index < 51; index++) {
    const response = await page.request.post("/api/v1/customers", {
      headers,
      data: { firstName: `SyntheticPage${index}`, lastName: "Pagination" },
    });
    expect(response.ok()).toBeTruthy();
  }
  await page.goto("/guests");
  await page.getByLabel("Name", { exact: true }).fill("SyntheticPage");
  await page
    .getByRole("button", { name: "Search guests", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Load more guests" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load more guests" }).click();
  await expect(
    page.getByRole("button", { name: "Load more guests" }),
  ).toHaveCount(0);
  await expect(page.getByText("51 shown", { exact: true })).toBeVisible();
});

test("Owner configures exact nightly and seasonal rates and explicitly reloads a concurrent price change", async ({
  page,
}, testInfo) => {
  await signIn(page);
  const created = await page.request.post("/api/v1/apartments", {
    headers: await headersFor(page),
    data: {
      name: "Synthetic seasonal studio",
      reference: "SEASON-6",
      capacity: 4,
    },
  });
  expect(created.ok()).toBeTruthy();
  const room = await created.json();
  const target = `/api/v1/apartments/${room.id}/rates`;
  await page.goto(`/rooms/${room.id}`);
  await expect(
    page.getByText("Rates need configuration", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Configure rates", exact: true })
    .click();
  const edit = page.getByRole("dialog", { name: "Edit nightly rates" });
  await edit.getByLabel("Base price (EUR per night)").fill("50,01");
  await edit.getByRole("button", { name: "Add seasonal price" }).click();
  await edit.getByLabel("Season name").fill("Synthetic leap-day season");
  await edit.getByLabel("Nightly price (EUR)").fill("75.01");
  await edit.getByLabel("Season start").fill("2028-02-29");
  await edit.getByLabel("Season end").fill("2028-03-02");
  await edit.getByRole("button", { name: "Save rates", exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect(page.getByText("€50.01", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Synthetic leap-day season", { exact: true }),
  ).toBeVisible();
  const preview = await page.request.post(`${target}/preview`, {
    headers: await headersFor(page),
    data: {
      startDate: "2028-02-28",
      endDate: "2028-03-02",
      guestCount: 4,
    },
  });
  expect(preview.ok()).toBeTruthy();
  expect(await preview.json()).toMatchObject({
    currency: "EUR",
    totalCents: 20003,
    nights: 3,
    rateVersion: 1,
  });
  await page.getByRole("button", { name: "Edit rates", exact: true }).click();
  await edit.getByLabel("Base price (EUR per night)").fill("60.01");
  const saved = await (await page.request.get(target)).json();
  const concurrent = await page.request.put(target, {
    headers: await headersFor(page),
    data: {
      expectedVersion: saved.version,
      currency: "EUR",
      baseNightlyCents: 7001,
      seasons: saved.seasons,
    },
  });
  expect(concurrent.ok()).toBeTruthy();
  await edit.getByRole("button", { name: "Save rates", exact: true }).click();
  await expect(edit.getByRole("alert")).toContainText(
    "The saved rates changed",
  );
  await expect(edit.getByLabel("Base price (EUR per night)")).toHaveValue(
    "60.01",
  );
  await expect(
    edit.getByRole("button", { name: "Save rates", exact: true }),
  ).toBeDisabled();
  await edit
    .getByRole("button", { name: "Load latest rates", exact: true })
    .click();
  await expect(edit.getByLabel("Base price (EUR per night)")).toHaveValue(
    "70.01",
  );
  await edit
    .getByRole("button", { name: "Remove season 1", exact: true })
    .click();
  await edit.getByLabel("Base price (EUR per night)").fill("71.01");
  await edit.getByRole("button", { name: "Save rates", exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect(page.getByText("€71.01", { exact: true })).toBeVisible();
  await expect(
    page.getByText("The base rate applies to every night.", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByRole("button", { name: "Edit rates", exact: true }).click();
  await edit.getByRole("button", { name: "Add seasonal price" }).click();
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const screenshot = testInfo.outputPath("rates-phone.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach("Nightly rate editor at 320px", {
    path: screenshot,
    contentType: "image/png",
  });
});

test("maintenance recovery survives another tab's confirmation, room archival and full reload without a second POST", async ({
  page,
  context,
}) => {
  await signIn(page);
  const response = await page.request.post("/api/v1/apartments", {
    headers: await headersFor(page),
    data: {
      name: "Synthetic recovery room",
      reference: "RECOVERY-4",
      capacity: 2,
    },
  });
  expect(response.ok()).toBeTruthy();
  const room = await response.json();
  const target = `/api/v1/apartments/${room.id}/maintenance`;
  const url = `/rooms/${room.id}?from=2032-01-01&to=2032-01-03`;
  let posts = 0;
  context.on("request", (request) => {
    if (
      new URL(request.url()).pathname === target &&
      request.method() === "POST"
    )
      posts++;
  });
  await page.route(`**${target}`, async (route) => {
    const saved = await route.fetch();
    expect(saved.ok()).toBeTruthy();
    await route.abort("failed");
  });
  const enter = async (tab: Page) => {
    await tab.goto(url);
    await tab
      .getByRole("button", { name: "Block for maintenance", exact: true })
      .click();
    const dialog = tab.getByRole("dialog", { name: "Block for maintenance" });
    await dialog.getByLabel("Reason").fill("Synthetic interrupted repair");
    return dialog;
  };
  const first = await enter(page);
  await first.getByRole("button", { name: "Save maintenance" }).click();
  await expect(first.getByRole("alert")).toContainText(
    "The result could not be confirmed",
  );
  const second = await context.newPage();
  const confirmation = await enter(second);
  await confirmation.getByRole("button", { name: "Save maintenance" }).click();
  await expect(confirmation).not.toBeVisible();
  const archived = await second.request.post(
    `/api/v1/apartments/${room.id}/status`,
    {
      headers: await headersFor(second),
      data: { active: false, expectedVersion: room.version },
    },
  );
  expect(archived.ok()).toBeTruthy();
  await page.reload();
  const recovered = page.getByRole("dialog", {
    name: "Check interrupted maintenance save",
  });
  await page
    .getByRole("button", {
      name: "Check interrupted maintenance save",
      exact: true,
    })
    .click();
  await recovered.getByLabel("Reason").fill("Synthetic interrupted repair");
  await recovered.getByRole("button", { name: "Check saved result" }).click();
  await expect(recovered).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Restore room", exact: true }),
  ).toBeVisible();
  expect(posts).toBe(1);
  const blocks = await (
    await page.request.get(
      `/api/v1/maintenance-blocks?startDate=2032-01-01&endDate=2032-01-03&roomId=${room.id}`,
    )
  ).json();
  expect(blocks.items).toHaveLength(1);
  expect(
    JSON.stringify(
      await page.evaluate(() => ({
        local: { ...localStorage },
        session: { ...sessionStorage },
      })),
    ),
  ).not.toContain("Synthetic interrupted repair");
  await second.close();
});

test("saved quotes require explicit acceptance, retain exact seasonal prices and survive rate changes", async ({
  page,
}, testInfo) => {
  await signIn(page);
  const headers = await headersFor(page);
  const created = await page.request.post("/api/v1/apartments", {
    headers,
    data: { name: "Synthetic quote studio", reference: "QUOTE-6", capacity: 4 },
  });
  expect(created.ok()).toBeTruthy();
  const room = await created.json();
  const guestResponse = await page.request.post("/api/v1/customers", {
    headers,
    data: { firstName: "Synthetic", lastName: "QuoteGuest" },
  });
  expect(guestResponse.ok()).toBeTruthy();
  const guestId = await guestResponse.json();
  await page.goto(`/reservations/new?guest=${guestId}`);
  await expect(
    page.getByRole("combobox", { name: "Guest", exact: true }),
  ).not.toHaveValue("");
  await page.getByLabel("Check-in", { exact: true }).fill("2028-02-28");
  await page.getByLabel("Check-out", { exact: true }).fill("2028-03-02");
  await page.getByLabel("Guests", { exact: true }).fill("4");
  await page.getByLabel("Room", { exact: true }).selectOption(String(room.id));
  await page.getByRole("button", { name: "Review price", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Configure this room's rates" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Confirm reservation/ }),
  ).toHaveCount(0);
  const ratesPath = `/api/v1/apartments/${room.id}/rates`;
  const seasons = [
    {
      name: "Synthetic leap-day season",
      startDate: "2028-02-29",
      endDate: "2028-03-02",
      nightlyCents: 7501,
    },
  ];
  expect(
    (
      await page.request.put(ratesPath, {
        headers,
        data: {
          expectedVersion: 0,
          currency: "EUR",
          baseNightlyCents: 5001,
          seasons,
        },
      })
    ).ok(),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Review price", exact: true }).click();
  const review = page.getByRole("region", {
    name: "Reviewed accommodation price",
  });
  await expect(review).toContainText("€200.03");
  await expect(review).toContainText("1 night × €50.01");
  await expect(review).toContainText("2 nights × €75.01");
  let confirmations = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/v1/reservations/quoted"
    )
      confirmations++;
  });
  expect(confirmations).toBe(0);
  expect(
    (
      await page.request.put(ratesPath, {
        headers,
        data: {
          expectedVersion: 1,
          currency: "EUR",
          baseNightlyCents: 6001,
          seasons,
        },
      })
    ).ok(),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "Confirm reservation · €200.03", exact: true })
    .click();
  await expect(review).toContainText("€210.03");
  await expect(
    page.getByText("The quote was refreshed.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Check-in", { exact: true })).toHaveValue(
    "2028-02-28",
  );
  expect(confirmations).toBe(1);
  await page.setViewportSize({ width: 320, height: 800 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const screenshot = testInfo.outputPath("quote-phone.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach("Review a saved quote at 320px", {
    path: screenshot,
    contentType: "image/png",
  });
  await page
    .getByRole("button", { name: "Confirm reservation · €210.03", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^Reservation #\d+$/,
  );
  expect(confirmations).toBe(2);
  const id = Number(new URL(page.url()).pathname.split("/").pop());
  const accepted = await (
    await page.request.get(`/api/v1/reservations/${id}/price`)
  ).json();
  expect(accepted).toMatchObject({
    recorded: true,
    price: {
      reservationVersion: 0,
      quote: { price: { totalCents: 21003, rateVersion: 2 } },
    },
  });
  expect(
    (
      await page.request.put(ratesPath, {
        headers,
        data: {
          expectedVersion: 2,
          currency: "EUR",
          baseNightlyCents: 9901,
          seasons: [],
        },
      })
    ).ok(),
  ).toBeTruthy();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Agreed accommodation price" }),
  ).toBeVisible();
  await expect(page.getByText("€210.03", { exact: true })).toBeVisible();
  expect(
    await (await page.request.get(`/api/v1/reservations/${id}/price`)).json(),
  ).toEqual(accepted);
  await page
    .getByRole("button", { name: "Price history", exact: true })
    .click();
  await expect(
    page.getByText("Current agreement", { exact: true }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("an Owner accepts a refreshed edit price and recovers a lost confirmation after cancellation and reload without another quote or write", async ({
  page,
}, testInfo) => {
  await signIn(page);
  const headers = await headersFor(page);
  const createdRoom = await page.request.post("/api/v1/apartments", {
    headers,
    data: { name: "Synthetic edit studio", reference: "EDIT-6", capacity: 4 },
  });
  expect(createdRoom.ok()).toBeTruthy();
  const room = await createdRoom.json();
  const ratesPath = `/api/v1/apartments/${room.id}/rates`;
  expect(
    (
      await page.request.put(ratesPath, {
        headers,
        data: {
          expectedVersion: 0,
          currency: "EUR",
          baseNightlyCents: 5001,
          seasons: [],
        },
      })
    ).ok(),
  ).toBeTruthy();
  const guest = await page.request.post("/api/v1/customers", {
    headers,
    data: { firstName: "Synthetic", lastName: "PriceEdit" },
  });
  expect(guest.ok()).toBeTruthy();
  const customerId = await guest.json();
  await page.goto(`/reservations/new?guest=${customerId}`);
  await expect(
    page.getByRole("combobox", { name: "Guest", exact: true }),
  ).not.toHaveValue("");
  await page.getByLabel("Check-in", { exact: true }).fill("2034-06-01");
  await page.getByLabel("Check-out", { exact: true }).fill("2034-06-03");
  await page.getByLabel("Room", { exact: true }).selectOption(String(room.id));
  await reviewAndConfirm(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^Reservation #\d+$/,
  );
  const id = Number(new URL(page.url()).pathname.split("/").pop());
  const target = `/api/v1/reservations/${id}/dates/quoted`;
  let editWrites = 0;
  let quoteWrites = 0;
  const keys: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === "PATCH" && path === target) {
      editWrites++;
      keys.push(request.headers()["idempotency-key"]);
    }
    if (request.method() === "POST" && path === "/api/v1/booking-quotes")
      quoteWrites++;
  });
  await page.getByRole("button", { name: "Edit stay", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit stay" });
  await edit.getByLabel("Check-out", { exact: true }).fill("2034-06-04");
  await edit.getByRole("button", { name: "Review price", exact: true }).click();
  await expect(
    edit.getByRole("button", {
      name: "Confirm changes · €150.03",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (
      await page.request.put(ratesPath, {
        headers,
        data: {
          expectedVersion: 1,
          currency: "EUR",
          baseNightlyCents: 6001,
          seasons: [],
        },
      })
    ).ok(),
  ).toBeTruthy();
  await edit
    .getByRole("button", { name: "Confirm changes · €150.03", exact: true })
    .click();
  await expect(
    edit.getByRole("button", {
      name: "Confirm changes · €180.03",
      exact: true,
    }),
  ).toBeVisible();
  await expect(edit.getByLabel("Check-out", { exact: true })).toHaveValue(
    "2034-06-04",
  );
  expect(editWrites).toBe(1);
  expect(
    (await (await page.request.get(`/api/v1/reservations/${id}`)).json())
      .version,
  ).toBe(0);
  await page.route(`**${target}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    await route.abort("failed");
  });
  await edit
    .getByRole("button", { name: "Confirm changes · €180.03", exact: true })
    .click();
  await expect(
    edit.getByText(/The result could not be confirmed/),
  ).toBeVisible();
  expect(editWrites).toBe(2);
  expect(new Set(keys).size).toBe(2);
  expect(
    (
      await page.request.put(ratesPath, {
        headers,
        data: {
          expectedVersion: 2,
          currency: "EUR",
          baseNightlyCents: 7001,
          seasons: [],
        },
      })
    ).ok(),
  ).toBeTruthy();
  const cancelled = await page.request.delete(
    `/api/v1/reservations?reservationId=${id}&expectedVersion=1`,
    { headers: { ...headers, "Idempotency-Key": crypto.randomUUID() } },
  );
  expect(cancelled.ok()).toBeTruthy();
  const quoteCount = quoteWrites;
  await page.reload();
  await page
    .getByRole("button", { name: "Check previous save", exact: true })
    .click();
  const recovered = page.getByRole("dialog", { name: "Check previous save" });
  await expect(recovered.getByLabel("Check-out", { exact: true })).toHaveValue(
    "2034-06-04",
  );
  await expect(
    recovered.getByRole("button", {
      name: /Review price|Confirm changes|Load latest stay/,
    }),
  ).toHaveCount(0);
  await recovered
    .getByRole("button", { name: "Check previous save", exact: true })
    .click();
  await expect(recovered).not.toBeVisible();
  expect(editWrites).toBe(2);
  expect(quoteWrites).toBe(quoteCount);
  expect(
    await (await page.request.get(`/api/v1/reservations/${id}`)).json(),
  ).toMatchObject({ status: "CANCELLED", version: 2 });
  const accepted = await (
    await page.request.get(`/api/v1/reservations/${id}/price`)
  ).json();
  expect(accepted).toMatchObject({
    recorded: true,
    price: {
      reservationVersion: 1,
      quote: { price: { rateVersion: 2, totalCents: 18003 } },
    },
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await page
    .getByRole("button", { name: "Price history", exact: true })
    .click();
  await expect(
    page.getByText("Previous agreement", { exact: true }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const screenshot = testInfo.outputPath("accepted-prices-phone.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach("Accepted price history at 320px", {
    path: screenshot,
    contentType: "image/png",
  });
});
