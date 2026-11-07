import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { addDays, propertyToday } from "../src/shared/format";

async function signIn(page: Page) {
  if (!process.env.VILLAS_LOCAL_INSTANCE?.startsWith("e2e-"))
    throw new Error("Use the disposable browser runner.");
  await page.goto("/");
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Sign in to local demo" }).click();
  const popup = await opened;
  await popup
    .getByRole("button", { name: "Synthetic Owner", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}
async function setup(page: Page, name: string) {
  const session = await (await page.request.get("/api/v1/auth/session")).json();
  const headers = {
    "X-CSRF-TOKEN": session.csrfToken,
    Origin: "http://127.0.0.1:15073",
  };
  const created = await page.request.post("/api/v1/apartments", {
    headers,
    data: {
      name,
      reference: `HK-${crypto.randomUUID().slice(0, 8)}`,
      capacity: 4,
    },
  });
  expect(created.ok()).toBe(true);
  return { room: await created.json(), headers };
}
test("Owners clean, inspect and reset rooms with dated maintenance on a phone without guest or financial requests", async ({
  page,
}, testInfo) => {
  await signIn(page);
  const { room, headers } = await setup(page, "Synthetic cleaning board");
  const today = propertyToday();
  const maintenance = await page.request.post(
    `/api/v1/apartments/${room.id}/maintenance`,
    {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: {
        startDate: addDays(today, 3),
        endDate: addDays(today, 4),
        reason: "Synthetic scheduled inspection",
      },
    },
  );
  expect(maintenance.ok()).toBe(true);
  await page.goto("/housekeeping");
  await expect(
    page.getByRole("heading", { name: "Housekeeping", exact: true }),
  ).toBeVisible();
  const requests: string[] = [];
  page.on("request", (request) =>
    requests.push(new URL(request.url()).pathname),
  );
  const card = page
    .locator(".housekeeping-card")
    .filter({ hasText: "Synthetic cleaning board" });
  await expect(
    card.getByText("Synthetic scheduled inspection", { exact: false }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 760 });
  for (const label of ["Start cleaning", "Send for inspection", "Mark clean"]) {
    await card.getByRole("button", { name: label, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Confirm room readiness" });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await dialog
      .getByRole("button", { name: "Confirm readiness", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
  }
  await expect(card.getByText("Clean", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Mark dirty", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Confirm room readiness" });
  await dialog
    .getByRole("button", { name: "Confirm readiness", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Enter a reason");
  await dialog
    .getByLabel("Reason", { exact: true })
    .fill("Synthetic inspection failed");
  await dialog
    .getByRole("button", { name: "Confirm readiness", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(card.getByText("Dirty", { exact: true })).toBeVisible();
  const history = await (
    await page.request.get(`/api/v1/apartments/${room.id}/readiness/events`)
  ).json();
  expect(history.items.map((event: { state: string }) => event.state)).toEqual([
    "IN_PROGRESS",
    "INSPECTION",
    "CLEAN",
    "DIRTY",
  ]);
  expect(history.items[3].reason).toBe("Synthetic inspection failed");
  expect(
    requests.filter(
      (path) => path.includes("/customers") || path.includes("/ledger"),
    ),
  ).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("housekeeping-phone.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: testInfo.outputPath("housekeeping-desktop.png"),
    fullPage: true,
  });
});

test("a lost readiness response remains recoverable from an archived room without another POST", async ({
  page,
}) => {
  await signIn(page);
  const { room, headers } = await setup(page, "Synthetic archived recovery");
  const target = `/api/v1/apartments/${room.id}/readiness`;
  let posts = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === target
    )
      posts++;
  });
  await page.route(`**${target}`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort("failed");
  });
  await page.goto("/housekeeping");
  const card = page
    .locator(".housekeeping-card")
    .filter({ hasText: "Synthetic archived recovery" });
  await card
    .getByRole("button", { name: "Start cleaning", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Confirm room readiness" });
  await dialog
    .getByLabel("Reason, optional")
    .fill("Synthetic interrupted cleaning");
  await dialog
    .getByRole("button", { name: "Confirm readiness", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "could not be confirmed",
  );
  const archived = await page.request.post(
    `/api/v1/apartments/${room.id}/status`,
    { headers, data: { active: false, expectedVersion: room.version } },
  );
  expect(archived.ok()).toBe(true);
  await page.goto(`/rooms/${room.id}`);
  await page
    .getByRole("button", { name: "Check previous readiness save", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Check previous readiness save" });
  await dialog.getByLabel("Previous target state").selectOption("IN_PROGRESS");
  await dialog
    .getByLabel("Reason, optional")
    .fill("Synthetic interrupted cleaning");
  await expect(
    dialog.getByRole("button", { name: "Confirm readiness", exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Check previous save", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(posts).toBe(1);
  const state = await (await page.request.get(target)).json();
  expect(state).toMatchObject({ state: "IN_PROGRESS", version: 1 });
  const events = await (await page.request.get(`${target}/events`)).json();
  expect(events.items).toHaveLength(1);
});
