import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { addDays, propertyToday } from "../src/shared/format";
async function signIn(page: Page) {
  await page.goto("/");
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Sign in to local demo" }).click();
  await (
    await opened
  )
    .getByRole("button", { name: "Synthetic Owner", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
}
async function setup(page: Page) {
  const session = await (await page.request.get("/api/v1/auth/session")).json();
  const headers = {
    "X-CSRF-TOKEN": session.csrfToken,
    Origin: "http://127.0.0.1:15073",
  };
  const uid = crypto.randomUUID().slice(0, 8);
  const created = await page.request.post("/api/v1/apartments", {
    headers,
    data: {
      name: `Synthetic report room ${uid}`,
      reference: `REP-${uid}`,
      capacity: 4,
    },
  });
  expect(created.ok()).toBe(true);
  const room = await created.json();
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
  ).toBe(true);
  for (const [version, state] of [
    "IN_PROGRESS",
    "INSPECTION",
    "CLEAN",
  ].entries())
    expect(
      (
        await page.request.post(`/api/v1/apartments/${room.id}/readiness`, {
          headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
          data: { state, expectedVersion: version },
        })
      ).ok(),
    ).toBe(true);
  const guest = await page.request.post("/api/v1/customers", {
    headers,
    data: {
      firstName: "Синтетички",
      lastName: `Report ${uid}`,
      email: "synthetic-private@example.test",
      phone: "000123456",
    },
  });
  expect(guest.ok()).toBe(true);
  const from = propertyToday(),
    to = addDays(from, 1);
  const request = {
    roomId: room.id,
    startDate: from,
    endDate: to,
    guestCount: 2,
  };
  const quote = await page.request.post("/api/v1/booking-quotes", {
    headers,
    data: request,
  });
  expect(quote.ok()).toBe(true);
  const booked = await page.request.post("/api/v1/reservations/quoted", {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: {
      ...request,
      customerId: await guest.json(),
      quoteId: (await quote.json()).id,
    },
  });
  expect(booked.ok()).toBe(true);
  return { id: (await booked.json()) as number, room, headers, from, to };
}
async function pay(page: Page, amount: string, reference: string) {
  await page
    .locator("#payments")
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  const form = page.getByRole("dialog", { name: "Record external payment" });
  await form.getByLabel("Amount in EUR").fill(amount);
  await form.getByLabel("Receipt reference, optional").fill(reference);
  await form.getByRole("button", { name: "Review record" }).click();
  await form.getByRole("button", { name: "Confirm payment record" }).click();
  await expect(form).not.toBeVisible();
}
test("Today leads to a real check-in, deposit, reconciled reports and a private CSV", async ({
  page,
}, info) => {
  await signIn(page);
  const { id, room, from, to } = await setup(page);
  await page.goto(`/reservations/${id}`);
  await page
    .locator("#stay-operations")
    .getByRole("button", { name: "Check in guest", exact: true })
    .click();
  const form = page.getByRole("dialog", {
    name: "Check in guest",
    exact: true,
  });
  await form.getByRole("button", { name: "Review action" }).click();
  await form
    .getByRole("button", { name: "Confirm check-in", exact: true })
    .click();
  await expect(form).not.toBeVisible();
  await pay(page, "25.01", "=SUM(1,2)");
  await page.goto("/today");
  await expect(
    page
      .getByRole("region", { name: "In-house stays" })
      .getByRole("link", { name: new RegExp(`#${id}$`) }),
  ).toBeVisible();
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`today-${width}.png`),
      fullPage: true,
    });
  }
  const path = (kind: string) =>
    `/reports?kind=${kind}&from=${from}&to=${to}&room=${room.id}`;
  await page.goto(path("OCCUPANCY"));
  await expect(page.getByText("100.0%", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Historical room availability was not tracked/),
  ).toBeVisible();
  await page.getByRole("link", { name: "Booking nights and charges" }).click();
  await expect(page.getByText("Complete booked charges")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Booked charge sources" }),
  ).toContainText("€50.01");
  await page.goto(path("BALANCES"));
  await expect(
    page.getByRole("region", { name: "Current booking balances" }),
  ).toContainText("€25.00");
  await page.goto(path("COLLECTIONS"));
  await expect(
    page.getByRole("region", { name: "Collection ledger sources" }),
  ).toContainText("€25.01");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download complete CSV" }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe(
    `villas-collections-${from}-${to}.csv`,
  );
  const csv = readFileSync((await download.path())!, "utf8");
  expect(csv).toContain('"METADATA"');
  expect(csv).toContain('"DATA"');
  expect(csv).toContain("Синтетички");
  expect(csv).toContain('"\'=SUM(1,2)"');
  expect(csv).not.toContain("synthetic-private@example.test");
  expect(csv).not.toContain("000123456");
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`reports-${width}.png`),
      fullPage: true,
    });
  }
  await page
    .getByRole("link", { name: new RegExp(`Booking #${id} · Entry #`) })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    `Reservation #${id}`,
  );
  const ledger = await (
    await page.request.get(`/api/v1/reservations/${id}/ledger`)
  ).json();
  expect(ledger.outstandingCents).toBe(2500);
  expect(ledger.totals.receivedCents).toBe(2501);
});
test("changed source records block stale CSV and a failed refresh retains a visible stale report", async ({
  page,
}) => {
  await signIn(page);
  const { id, room, headers, from, to } = await setup(page);
  await page.goto(
    `/reports?kind=BALANCES&from=${from}&to=${to}&room=${room.id}`,
  );
  await expect(page.getByText("Complete outstanding")).toBeVisible();
  const saved = await page.request.post(
    `/api/v1/reservations/${id}/ledger/payments`,
    {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: {
        amountCents: 100,
        method: "CASH",
        effectiveDate: from,
        expectedVersion: 0,
        currency: "EUR",
      },
    },
  );
  expect(saved.ok()).toBe(true);
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.getByRole("button", { name: "Download complete CSV" }).click();
  await expect(
    page.getByText(/Refresh the report before downloading/),
  ).toBeVisible();
  expect(downloads).toBe(0);
  await page.getByRole("button", { name: "Refresh report" }).click();
  await expect(
    page.getByRole("region", { name: "Current booking balances" }),
  ).toContainText("€49.01");
  await page.route("**/api/v1/reports?*", (route) =>
    route.fulfill({ status: 503, json: { code: "TEMPORARILY_UNAVAILABLE" } }),
  );
  await page.getByRole("button", { name: "Refresh report" }).click();
  await expect(page.getByRole("alert")).toContainText("previously loaded data");
  await expect(
    page.getByRole("button", { name: "Download complete CSV" }),
  ).toBeDisabled();
  expect(downloads).toBe(0);
});
