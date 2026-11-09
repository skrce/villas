import { businessUrl, businessRequest } from "./business";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function signIn(page: Page) {
  if (!process.env.VILLAS_LOCAL_INSTANCE?.startsWith("e2e-"))
    throw new Error("Use the disposable browser runner.");
  await page.goto(businessUrl("/"));
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Sign in to local demo" }).click();
  const popup = await opened;
  await popup
    .getByRole("button", { name: "Synthetic Owner", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}
async function createStay(page: Page) {
  const session = await (
    await businessRequest(page).get("/api/v1/auth/session")
  ).json();
  const headers = {
    "X-CSRF-TOKEN": session.csrfToken,
    Origin: "http://127.0.0.1:15073",
  };
  const createdRoom = await businessRequest(page).post("/api/v1/apartments", {
    headers,
    data: {
      name: "Synthetic payment room",
      reference: `PAY-${crypto.randomUUID().slice(0, 8)}`,
      capacity: 4,
    },
  });
  expect(createdRoom.ok()).toBe(true);
  const room = await createdRoom.json();
  const rated = await businessRequest(page).put(
    `/api/v1/apartments/${room.id}/rates`,
    {
      headers,
      data: {
        expectedVersion: 0,
        currency: "EUR",
        baseNightlyCents: 5001,
        seasons: [],
      },
    },
  );
  expect(rated.ok()).toBe(true);
  const createdGuest = await businessRequest(page).post("/api/v1/customers", {
    headers,
    data: {
      firstName: "Synthetic",
      lastName: `Payment ${crypto.randomUUID().slice(0, 8)}`,
    },
  });
  expect(createdGuest.ok()).toBe(true);
  const guestId = await createdGuest.json();
  expect(Number.isInteger(guestId)).toBe(true);
  const quoted = await businessRequest(page).post("/api/v1/booking-quotes", {
    headers,
    data: {
      roomId: room.id,
      startDate: "2042-09-01",
      endDate: "2042-09-03",
      guestCount: 2,
      currency: "EUR",
    },
  });
  expect(quoted.ok()).toBe(true);
  const quote = await quoted.json();
  const confirmed = await businessRequest(page).post(
    "/api/v1/reservations/quoted",
    {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: {
        customerId: guestId,
        quoteId: quote.id,
        roomId: room.id,
        startDate: quote.startDate,
        endDate: quote.endDate,
        guestCount: 2,
      },
    },
  );
  expect(confirmed.ok()).toBe(true);
  return { id: (await confirmed.json()) as number, headers };
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
const figure = (page: Page, label: string) =>
  page
    .locator("#payments")
    .getByText(label, { exact: true })
    .locator("..")
    .locator("dd");

test("Owners record deposits, settlement, credit, reversals and separate cancellation refunds on desktop and phone", async ({
  page,
}, testInfo) => {
  await signIn(page);
  const { id, headers } = await createStay(page);
  await page.goto(businessUrl(`/reservations/${id}`));
  await expect(figure(page, "Outstanding")).toHaveText("€100.02");
  await payment(page, "25.01", "Synthetic deposit");
  await expect(figure(page, "Outstanding")).toHaveText("€75.01");
  await page.reload();
  await expect(figure(page, "Net received")).toHaveText("€25.01");
  await payment(page, "75.01", "Synthetic final payment");
  await expect(figure(page, "Outstanding")).toHaveText("€0.00");
  await payment(page, "1.00", "Synthetic mistaken record");
  await expect(figure(page, "Credit")).toHaveText("€1.00");
  const mistaken = page
    .locator(".ledger-history li")
    .filter({ hasText: "Synthetic mistaken record" });
  await mistaken.getByRole("button", { name: "Correct record" }).click();
  let dialog = page.getByRole("dialog", { name: "Correct financial record" });
  await dialog
    .getByLabel("Reason")
    .fill("Synthetic duplicate entered in error");
  await dialog.getByRole("button", { name: "Review record" }).click();
  await page.setViewportSize({ width: 320, height: 760 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Confirm reversal record" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(figure(page, "Credit")).toHaveText("€0.00");
  await expect(
    mistaken.getByText("Reversed by a linked correction."),
  ).toBeVisible();
  const current = await (
    await businessRequest(page).get(`/api/v1/reservations/${id}`)
  ).json();
  const cancelled = await businessRequest(page).delete(
    `/api/v1/reservations?reservationId=${id}&expectedVersion=${current.version}`,
    { headers: { ...headers, "Idempotency-Key": crypto.randomUUID() } },
  );
  expect(cancelled.ok()).toBe(true);
  await page.reload();
  await expect(figure(page, "Accommodation owed")).toHaveText("€0.00");
  await expect(figure(page, "Credit")).toHaveText("€100.02");
  await expect(
    page.getByText(/retained accommodation agreement is €100.02/),
  ).toBeVisible();
  await page
    .locator("#payments")
    .getByRole("button", { name: "Record refund", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Record external refund" });
  const finances = await (
    await businessRequest(page).get(
      `/api/v1/reservations/${id}/ledger/payments`,
    )
  ).json();
  const deposit = finances.items.find(
    (item: { entry: { reference: string } }) =>
      item.entry.reference === "Synthetic deposit",
  );
  await dialog.getByLabel("Original receipt").selectOption(deposit.entry.id);
  await dialog.getByLabel("Amount in EUR").fill("25.01");
  await dialog.getByLabel("Payment method").selectOption("BANK_TRANSFER");
  await dialog
    .getByLabel("Reason")
    .fill("Synthetic cancelled deposit returned");
  await dialog.getByRole("button", { name: "Review record" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await dialog.getByRole("button", { name: "Confirm refund record" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(figure(page, "Credit")).toHaveText("€75.01");
  const history = await (
    await businessRequest(page).get(`/api/v1/reservations/${id}/ledger/entries`)
  ).json();
  expect(history.items).toHaveLength(5);
  expect(
    history.items.filter(
      (entry: { kind: string }) => entry.kind === "REVERSAL",
    ),
  ).toHaveLength(1);
  expect(
    history.items.find((entry: { kind: string }) => entry.kind === "REFUND")
      .paymentId,
  ).toBe(deposit.entry.id);
  await page.screenshot({
    path: testInfo.outputPath("payments-phone.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("payments-desktop.png"),
    fullPage: true,
  });
});

test("a lost payment response survives cancellation and both tabs reconcile the original receipt without another POST", async ({
  page,
  context,
}) => {
  await signIn(page);
  const { id, headers } = await createStay(page);
  const target = `/api/v1/reservations/${id}/ledger/payments`;
  let posts = 0;
  let original = "";
  for (const tab of [page])
    tab.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === target
      )
        posts++;
    });
  await page.route(`**${target}`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    original = route.request().headers()["idempotency-key"];
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort("failed");
  });
  await page.goto(businessUrl(`/reservations/${id}`));
  await page
    .locator("#payments")
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Record external payment" });
  await dialog.getByLabel("Amount in EUR").fill("25.01");
  await dialog
    .getByLabel("Receipt reference, optional")
    .fill("Synthetic interrupted deposit");
  await dialog.getByRole("button", { name: "Review record" }).click();
  expect(posts).toBe(0);
  await dialog.getByRole("button", { name: "Confirm payment record" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "could not be confirmed",
  );
  const held = await (
    await businessRequest(page).get(`/api/v1/reservations/${id}/ledger`)
  ).json();
  expect(held.totals.receivedCents).toBe(2501);
  expect(held.reservation.version).toBe(1);
  const cancelled = await businessRequest(page).delete(
    `/api/v1/reservations?reservationId=${id}&expectedVersion=1`,
    { headers: { ...headers, "Idempotency-Key": crypto.randomUUID() } },
  );
  expect(cancelled.ok()).toBe(true);
  const second = await context.newPage();
  second.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === target
    )
      posts++;
  });
  try {
    for (const tab of [second, page]) {
      await tab.goto(businessUrl(`/reservations/${id}`));
      await expect(figure(tab, "Credit")).toHaveText("€25.01");
      await tab
        .locator("#payments")
        .getByRole("button", { name: "Record payment", exact: true })
        .click();
      dialog = tab.getByRole("dialog", { name: "Record external payment" });
      await dialog.getByLabel("Amount in EUR").fill("25.01");
      await dialog
        .getByLabel("Receipt reference, optional")
        .fill("Synthetic interrupted deposit");
      await dialog.getByRole("button", { name: "Check previous save" }).click();
      await expect(dialog).not.toBeVisible();
    }
  } finally {
    await second.close();
  }
  expect(posts).toBe(1);
  const history = await (
    await businessRequest(page).get(`/api/v1/reservations/${id}/ledger/entries`)
  ).json();
  expect(history.items).toHaveLength(1);
  expect(history.items[0].operationKey).toBe(original);
  const record = await (
    await businessRequest(page).get(`/api/v1/reservations/${id}/ledger`)
  ).json();
  expect(record.creditCents).toBe(2501);
  expect(record.reservation.version).toBe(2);
});

test("a lost reversal response remains recoverable from its reversed original after reload", async ({
  page,
}) => {
  await signIn(page);
  const { id } = await createStay(page);
  await page.goto(businessUrl(`/reservations/${id}`));
  await payment(page, "10.00", "Synthetic reversal recovery");
  const entries = await (
    await businessRequest(page).get(`/api/v1/reservations/${id}/ledger/entries`)
  ).json();
  const receiptId = entries.items[0].id;
  const target = `/api/v1/reservations/${id}/ledger/entries/${receiptId}/reversal`;
  let posts = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === target
    )
      posts++;
  });
  await page.route(`**${target}`, async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort("failed");
  });
  await page
    .locator(".ledger-history li")
    .filter({ hasText: "Synthetic reversal recovery" })
    .getByRole("button", { name: "Correct record" })
    .click();
  let dialog = page.getByRole("dialog", { name: "Correct financial record" });
  await dialog.getByLabel("Reason").fill("Synthetic duplicated receipt");
  await dialog.getByRole("button", { name: "Review record" }).click();
  await dialog.getByRole("button", { name: "Confirm reversal record" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "could not be confirmed",
  );
  await page.reload();
  await expect(figure(page, "Net received")).toHaveText("€0.00");
  await page
    .getByRole("button", { name: "Check previous correction", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Correct financial record" });
  await dialog.getByLabel("Reason").fill("Synthetic duplicated receipt");
  await expect(
    dialog.getByRole("button", { name: "Review record" }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Confirm reversal record" }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Check previous save" }).click();
  await expect(dialog).not.toBeVisible();
  expect(posts).toBe(1);
  const final = await (
    await businessRequest(page).get(`/api/v1/reservations/${id}/ledger/entries`)
  ).json();
  expect(final.items).toHaveLength(2);
  expect(final.items[0].reversesId).toBe(receiptId);
});
