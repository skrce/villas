import { expect, test, type Page } from "@playwright/test";
import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { addDays, propertyToday } from "../src/shared/format";
const clockFile = () => {
  if (
    !process.env.VILLAS_LOCAL_INSTANCE?.startsWith("e2e-") ||
    !process.env.VILLAS_BROWSER_CLOCK_FILE
  )
    throw new Error(
      "Use the disposable browser runner with its test-only clock fixture.",
    );
  return process.env.VILLAS_BROWSER_CLOCK_FILE;
};
const setDay = (day: string) => {
  const file = clockFile();
  writeFileSync(`${file}.next`, `${day}T10:00:00Z`, { mode: 0o600 });
  renameSync(`${file}.next`, file);
};
test.afterEach(() => {
  const file = clockFile();
  if (existsSync(file)) rmSync(file);
});
async function signIn(page: Page) {
  await page.goto("/");
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Sign in to local demo" }).click();
  const popup = await opened;
  await popup
    .getByRole("button", { name: "Synthetic Owner", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}
async function setup(page: Page, label: string) {
  const session = await (await page.request.get("/api/v1/auth/session")).json();
  const headers = {
    "X-CSRF-TOKEN": session.csrfToken,
    Origin: "http://127.0.0.1:15073",
  };
  const rooms = [];
  for (const [index, cents] of [
    [1, 5001],
    [2, 6001],
  ]) {
    const created = await page.request.post("/api/v1/apartments", {
      headers,
      data: {
        name: `Synthetic ${label} room ${index}`,
        reference: `STAY-${crypto.randomUUID().slice(0, 8)}`,
        capacity: 4,
      },
    });
    expect(created.ok()).toBe(true);
    const room = await created.json();
    rooms.push(room);
    const rated = await page.request.put(
      `/api/v1/apartments/${room.id}/rates`,
      {
        headers,
        data: {
          expectedVersion: 0,
          currency: "EUR",
          baseNightlyCents: cents,
          seasons: [],
        },
      },
    );
    expect(rated.ok()).toBe(true);
  }
  const created = await page.request.post("/api/v1/customers", {
    headers,
    data: { firstName: "Synthetic", lastName: `${label} guest` },
  });
  expect(created.ok()).toBe(true);
  return { headers, rooms, guestId: await created.json() };
}
async function clean(page: Page, name: string) {
  await page.goto("/housekeeping");
  const card = page.locator(".housekeeping-card").filter({ hasText: name });
  for (const action of [
    "Start cleaning",
    "Send for inspection",
    "Mark clean",
  ]) {
    await card.getByRole("button", { name: action, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Confirm room readiness" });
    await dialog
      .getByRole("button", { name: "Confirm readiness", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
  }
  await expect(card.getByText("Clean", { exact: true })).toBeVisible();
}
async function create(
  page: Page,
  guest: number,
  room: number,
  from: string,
  to: string,
) {
  await page.goto(
    `/reservations/new?guest=${guest}&room=${room}&from=${from}&to=${to}`,
  );
  await page
    .getByRole("button", { name: "Show all steps", exact: true })
    .click();
  await expect(page.getByLabel("Guest", { exact: true })).not.toHaveValue("");
  await page.getByRole("button", { name: "Review price", exact: true }).click();
  await page.getByRole("button", { name: /^Confirm reservation ·/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^Reservation #\d+$/,
  );
  return Number(new URL(page.url()).pathname.split("/").pop());
}
async function edit(
  page: Page,
  kind: "Edit stay" | "Move room",
  reason: string,
  target: string,
) {
  await page.getByRole("button", { name: kind, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: kind });
  if (kind === "Edit stay")
    await dialog.getByLabel("Check-out", { exact: true }).fill(target);
  else
    await dialog.getByLabel("New room", { exact: true }).selectOption(target);
  await dialog.getByLabel("Reason", { exact: true }).fill(reason);
  await dialog
    .getByRole("button", { name: "Review price", exact: true })
    .click();
  await dialog.getByRole("button", { name: /^Confirm changes ·/ }).click();
  await expect(dialog).not.toBeVisible();
}
async function payment(page: Page, amount: string, reference: string) {
  await page
    .locator("#payments")
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Record external payment" });
  await dialog.getByLabel("Amount in EUR").fill(amount);
  await dialog.getByLabel("Receipt reference, optional").fill(reference);
  await dialog.getByRole("button", { name: "Review record" }).click();
  await dialog.getByRole("button", { name: "Confirm payment record" }).click();
  await expect(dialog).not.toBeVisible();
}
async function operate(page: Page, title: string, confirm: string) {
  await page
    .locator("#stay-operations")
    .getByRole("button", { name: title, exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  await dialog.getByRole("button", { name: "Review action" }).click();
  await dialog.getByRole("button", { name: confirm, exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
test("an Owner completes a repriced, moved and settled stay across property days with retained history", async ({
  page,
}, testInfo) => {
  const today = propertyToday(),
    tomorrow = addDays(today, 1);
  setDay(today);
  await signIn(page);
  const { rooms, guestId } = await setup(page, "full stay");
  for (const room of rooms) await clean(page, room.name);
  const id = await create(page, guestId, rooms[0].id, today, tomorrow);
  await payment(page, "25.01", "Synthetic deposit");
  await edit(
    page,
    "Edit stay",
    "Synthetic extension request",
    addDays(today, 2),
  );
  await edit(
    page,
    "Move room",
    "Synthetic requested room change",
    String(rooms[1].id),
  );
  await operate(page, "Check in guest", "Confirm check-in");
  await expect(
    page.locator("#stay-operations").getByText("Checked in", { exact: true }),
  ).toBeVisible();
  await edit(
    page,
    "Move room",
    "Synthetic in-house room change",
    String(rooms[0].id),
  );
  setDay(tomorrow);
  await page.reload();
  await expect(page.locator("#stay-operations")).toContainText(
    "Checkout is available on the booked departure date",
  );
  await edit(
    page,
    "Edit stay",
    "Synthetic early departure agreement",
    tomorrow,
  );
  await payment(page, "25.00", "Synthetic settlement");
  await page.setViewportSize({ width: 320, height: 760 });
  await page
    .locator("#stay-operations")
    .getByRole("button", { name: "Check out guest", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Check out guest",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Review action" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await dialog
    .getByRole("button", { name: "Confirm checkout", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.locator("#stay-operations").getByText("Checked out", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Edit stay", exact: true }),
  ).not.toBeVisible();
  await page
    .locator("#stay-operations")
    .getByRole("button", { name: "Correct actual times", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Correct actual times",
    exact: true,
  });
  await dialog.getByLabel("Actual arrival time").fill("10:59:00");
  await dialog
    .getByLabel("Reason", { exact: true })
    .fill("Synthetic arrival clock correction");
  await dialog.getByRole("button", { name: "Resolve property times" }).click();
  await expect(dialog.getByLabel("Arrival UTC offset")).not.toHaveValue("");
  await dialog.getByRole("button", { name: "Review action" }).click();
  await dialog.getByRole("button", { name: "Confirm time correction" }).click();
  await expect(dialog).not.toBeVisible();
  const record = await (
    await page.request.get(`/api/v1/reservations/${id}`)
  ).json();
  expect(record.phase).toBe("CHECKED_OUT");
  expect(record.checkedInAt).not.toBe(`${today}T10:00:00Z`);
  const ledger = await (
    await page.request.get(`/api/v1/reservations/${id}/ledger`)
  ).json();
  expect(ledger.outstandingCents).toBe(0);
  expect(ledger.totals.receivedCents).toBe(5001);
  const entries = await (
    await page.request.get(`/api/v1/reservations/${id}/ledger/entries`)
  ).json();
  expect(entries.items).toHaveLength(2);
  const prices = await (
    await page.request.get(`/api/v1/reservations/${id}/prices`)
  ).json();
  expect(prices.items).toHaveLength(5);
  const history = await (
    await page.request.get(`/api/v1/reservations/${id}/events`)
  ).json();
  expect(history.items.map((event: { kind: string }) => event.kind)).toEqual([
    "CREATED",
    "CHANGED",
    "MOVED",
    "CHECKED_IN",
    "MOVED",
    "CHANGED",
    "CHECKED_OUT",
    "CORRECTED",
  ]);
  const ready = await (
    await page.request.get(`/api/v1/apartments/${rooms[0].id}/readiness`)
  ).json();
  expect(ready.state).toBe("DIRTY");
  await page.screenshot({
    path: testInfo.outputPath("completed-stay-phone.png"),
    fullPage: true,
  });
  await clean(page, rooms[0].name);
  const cleaning = await (
    await page.request.get(`/api/v1/apartments/${rooms[0].id}/readiness/events`)
  ).json();
  expect(
    cleaning.items.some(
      (event: { reservationId: number; state: string }) =>
        event.reservationId === id && event.state === "DIRTY",
    ),
  ).toBe(true);
  await page.goto(`/reservations/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    `Reservation #${id}`,
  );
  await expect(
    page.locator("#stay-operations").getByText("Checked out", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("completed-stay-desktop.png"),
    fullPage: true,
  });
});
test("a lost check-in response remains read-only recoverable after reload and a later payment", async ({
  page,
}) => {
  const today = propertyToday();
  setDay(today);
  await signIn(page);
  const { rooms, guestId } = await setup(page, "recovery");
  await clean(page, rooms[0].name);
  const id = await create(page, guestId, rooms[0].id, today, addDays(today, 1));
  let posts = 0;
  const target = `/api/v1/reservations/${id}/check-in`;
  await page.route(`**${target}`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort("failed");
  });
  await page
    .locator("#stay-operations")
    .getByRole("button", { name: "Check in guest", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Check in guest",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Review action" }).click();
  await dialog
    .getByRole("button", { name: "Confirm check-in", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "could not be confirmed",
  );
  await page.reload();
  await payment(page, "10.00", "Synthetic payment after arrival");
  await page
    .locator("#stay-operations")
    .getByRole("button", { name: "Check previous stay action", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Check previous stay action",
    exact: true,
  });
  await dialog.getByLabel("Previous stay action").selectOption("CHECK_IN");
  await dialog
    .getByRole("button", { name: "Check previous save", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(posts).toBe(1);
  expect(
    (await (await page.request.get(`/api/v1/reservations/${id}`)).json())
      .version,
  ).toBe(2);
});
