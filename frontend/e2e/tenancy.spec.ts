import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { businessRequest, businessUrl } from "./business";

const businessA = () => process.env.VILLAS_PROPERTY_ID!;
const businessB = () => `${businessA()}-lake`;
const headers = async (page: Page) => ({
  "X-CSRF-TOKEN": (
    await (await page.request.get("/api/v1/auth/session")).json()
  ).csrfToken as string,
  Origin: "http://127.0.0.1:15073",
});
async function login(
  page: Page,
  business = businessA(),
  account = "Synthetic Owner",
) {
  await page.goto(businessUrl("/today", business));
  const signIn = page.getByRole("button", { name: "Sign in to local demo" });
  await expect(
    signIn.or(page.getByRole("navigation", { name: "Main navigation" })),
  ).toBeVisible();
  if (await signIn.isVisible()) await renew(page, account);
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
}
async function renew(page: Page, account = "Synthetic Owner") {
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Sign in to local demo" }).click();
  const popup = await opened;
  await popup.getByRole("button", { name: account, exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
}
async function newRoom(page: Page, name: string) {
  const created = await businessRequest(page).post("/api/v1/apartments", {
    headers: await headers(page),
    data: {
      name,
      reference: `TEN-${crypto.randomUUID().slice(0, 8)}`,
      capacity: 4,
    },
  });
  expect(created.ok()).toBeTruthy();
  const room = await created.json();
  const rated = await businessRequest(page).put(
    `/api/v1/apartments/${room.id}/rates`,
    {
      headers: await headers(page),
      data: {
        expectedVersion: 0,
        currency: "EUR",
        baseNightlyCents: 5001,
        seasons: [],
      },
    },
  );
  expect(rated.ok()).toBeTruthy();
  return room;
}
async function bookingForm(
  page: Page,
  guest: number,
  room: number,
  recover = false,
) {
  await page.goto(businessUrl(`/reservations/new?guest=${guest}`, businessA()));
  const show = page.getByRole("button", {
    name: "Show all steps",
    exact: true,
  });
  await show.click();
  await expect(
    page.getByRole("combobox", { name: "Guest", exact: true }),
  ).not.toHaveValue("");
  await page.getByLabel("Check-in", { exact: true }).fill("2036-06-01");
  await page.getByLabel("Check-out", { exact: true }).fill("2036-06-03");
  await page.getByLabel("Guests", { exact: true }).fill("1");
  if (recover)
    await page
      .getByRole("checkbox", {
        name: "Include unavailable rooms for an interrupted save",
      })
      .check();
  await page.getByLabel("Room", { exact: true }).selectOption(String(room));
}

test("two business URLs keep separate tabs, drafts, request headers and accessible phone navigation", async ({
  page,
  context,
}, info) => {
  await login(page);
  const second = await context.newPage();
  await second.goto(businessUrl("/rooms", businessB()));
  await expect(second.getByRole("combobox", { name: "Business" })).toHaveValue(
    businessB(),
  );
  const roomB = await newRoom(second, "Synthetic green business room");
  const seen: string[] = [];
  second.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/v1/apartments"))
      seen.push(request.headers()["x-villas-business"]);
  });
  await second.reload();
  await expect(
    second.getByRole("heading", { name: roomB.name, exact: true }),
  ).toBeVisible();
  await expect(
    second.getByRole("heading", {
      name: "Synthetic lake room · South",
      exact: true,
    }),
  ).not.toBeVisible();
  expect(seen.length).toBeGreaterThan(0);
  expect(seen.every((id) => id === businessB())).toBe(true);
  await expect(page.getByRole("combobox", { name: "Business" })).toHaveValue(
    businessA(),
  );
  await expect(page).toHaveTitle(
    new RegExp(`${process.env.VILLAS_PROPERTY_NAME} · Villas`),
  );
  await expect(second).toHaveTitle(/Lake business.*Villas/);
  await expect(
    second
      .getByRole("main")
      .getByText("Lake business · Синтетички апартмани", { exact: true }),
  ).toBeVisible();

  await page.goto(businessUrl("/reservations/new"));
  await page
    .getByRole("button", { name: "Show all steps", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Guest", exact: true })
    .fill("Synthetic blue private draft");
  await page
    .getByRole("combobox", { name: "Business" })
    .selectOption(businessB());
  await page.getByRole("link", { name: "Reservations", exact: true }).click();
  await page.getByRole("link", { name: /New reservation/ }).click();
  await page
    .getByRole("button", { name: "Show all steps", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Guest", exact: true }),
  ).toHaveValue("");
  await page
    .getByRole("combobox", { name: "Guest", exact: true })
    .fill("Synthetic green private draft");
  await page
    .getByRole("combobox", { name: "Business" })
    .selectOption(businessA());
  await expect(
    page.getByRole("combobox", { name: "Guest", exact: true }),
  ).toHaveValue("Synthetic blue private draft");
  await page
    .getByRole("combobox", { name: "Business" })
    .selectOption(businessB());
  await expect(
    page.getByRole("combobox", { name: "Guest", exact: true }),
  ).toHaveValue("Synthetic green private draft");
  await second.reload();
  await expect(
    second.getByRole("heading", { name: roomB.name, exact: true }),
  ).toBeVisible();
  const storage = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  expect(storage).not.toContain("private draft");
  expect(storage).not.toContain("owner@example.test");
  for (const width of [1440, 320]) {
    await second.setViewportSize({ width, height: 900 });
    await expect(
      second.getByRole("combobox", { name: "Business" }),
    ).toBeVisible();
    expect(
      (await new AxeBuilder({ page: second }).analyze()).violations,
    ).toEqual([]);
    expect(
      await second.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await second.screenshot({
      path: info.outputPath(`business-switcher-${width}.png`),
      fullPage: true,
    });
  }
  await second.getByRole("combobox", { name: "Business" }).focus();
  await second
    .getByRole("combobox", { name: "Business" })
    .press(process.env.VILLAS_PROPERTY_NAME!.slice(0, 1).toLowerCase());
  await expect(second.getByRole("combobox", { name: "Business" })).toHaveValue(
    businessA(),
  );
  await expect(page.getByRole("combobox", { name: "Business" })).toHaveValue(
    businessB(),
  );
});

test("a committed booking response lost during a business switch retains its key through reload and read-only recovery", async ({
  page,
}) => {
  await login(page);
  const room = await newRoom(page, "Synthetic business-switch recovery room");
  const created = await businessRequest(page).post("/api/v1/customers", {
    headers: await headers(page),
    data: { firstName: "Synthetic blue recovery", lastName: "Guest" },
  });
  expect(created.ok()).toBeTruthy();
  const guest = await created.json();
  let originalKey = "";
  let committed = false;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let posts = 0;
  await page.route("**/api/v1/reservations/quoted", async (route) => {
    posts++;
    originalKey = route.request().headers()["idempotency-key"];
    expect(route.request().headers()["x-villas-business"]).toBe(businessA());
    const saved = await route.fetch();
    expect(saved.ok()).toBeTruthy();
    committed = true;
    await held;
    await route.abort("failed").catch(() => {});
  });
  await bookingForm(page, guest, room.id);
  await page.getByRole("button", { name: "Review price", exact: true }).click();
  await page.getByRole("button", { name: /Confirm reservation ·/ }).click();
  await expect.poll(() => committed).toBe(true);
  await page
    .getByRole("combobox", { name: "Business" })
    .selectOption(businessB());
  release();
  await page.getByRole("link", { name: "Rooms", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: room.name, exact: true }),
  ).not.toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("villarosa.pendingOperations.v2"),
    ),
  ).toContain(originalKey);
  await page.unroute("**/api/v1/reservations/quoted");
  await bookingForm(page, guest, room.id, true);
  await page
    .getByRole("button", { name: "Check previous save", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Reservation #/ }),
  ).toBeVisible();
  expect(posts).toBe(1);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("villarosa.pendingOperations.v2"),
    ),
  ).not.toContain(originalKey);
  await expect(page).toHaveURL(
    new RegExp(`/businesses/${businessA()}/reservations/[0-9]+$`),
  );
});

test("late room and CSV responses cannot populate or download into another business", async ({
  page,
}) => {
  await login(page);
  let releaseRead!: () => void;
  const readHeld = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  let readFinished!: () => void;
  const readCompleted = new Promise<void>((resolve) => {
    readFinished = resolve;
  });
  let readStarted = false;
  await page.route("**/api/v1/apartments/directory**", async (route) => {
    if (route.request().headers()["x-villas-business"] !== businessA())
      return route.continue();
    const response = await route.fetch();
    readStarted = true;
    await readHeld;
    await route.fulfill({ response }).catch(() => {});
    readFinished();
  });
  await page.getByRole("link", { name: "Rooms", exact: true }).click();
  await expect.poll(() => readStarted).toBe(true);
  await page
    .getByRole("combobox", { name: "Business" })
    .selectOption(businessB());
  await page.getByRole("link", { name: "Rooms", exact: true }).click();
  releaseRead();
  await readCompleted;
  await expect(
    page.getByRole("heading", {
      name: "Synthetic lake room · South",
      exact: true,
    }),
  ).not.toBeVisible();
  await page.unroute("**/api/v1/apartments/directory**");
  await page.goto(
    businessUrl(
      "/reports?kind=COLLECTIONS&from=2036-06-01&to=2036-06-03",
      businessA(),
    ),
  );
  await expect(
    page.getByRole("button", { name: "Download complete CSV" }),
  ).toBeEnabled();
  let releaseCsv!: () => void;
  const csvHeld = new Promise<void>((resolve) => {
    releaseCsv = resolve;
  });
  let csvFinished!: () => void;
  const csvCompleted = new Promise<void>((resolve) => {
    csvFinished = resolve;
  });
  let csvStarted = false;
  const downloads: unknown[] = [];
  page.on("download", (download) => downloads.push(download));
  await page.route("**/api/v1/reports/export?**", async (route) => {
    const response = await route.fetch();
    csvStarted = true;
    await csvHeld;
    await route.fulfill({ response }).catch(() => {});
    csvFinished();
  });
  await page.getByRole("button", { name: "Download complete CSV" }).click();
  await expect.poll(() => csvStarted).toBe(true);
  await page
    .getByRole("combobox", { name: "Business" })
    .selectOption(businessB());
  releaseCsv();
  await csvCompleted;
  expect(downloads).toHaveLength(0);
  await page.unroute("**/api/v1/reports/export?**");
  await page.goto(
    businessUrl(
      "/reports?kind=COLLECTIONS&from=2036-06-01&to=2036-06-03",
      businessB(),
    ),
  );
  await expect(
    page.getByRole("button", { name: "Download complete CSV" }),
  ).toBeEnabled();
  expect(downloads).toHaveLength(0);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download complete CSV" }).click();
  expect((await downloaded).suggestedFilename()).toBe(
    `villas-${businessB()}-collections-2036-06-01-2036-06-03.csv`,
  );
});

test("revoking one business preserves the other tab and renews only after deliberate sign-in", async ({
  page,
  browser,
}) => {
  await login(page, businessB());
  const invitation = await businessRequest(page).post(
    "/api/v1/staff/invitations",
    {
      headers: await headers(page),
      data: { email: "second-owner@example.test" },
    },
  );
  expect(invitation.ok()).toBeTruthy();
  const controller = await browser.newContext();
  const manager = await controller.newPage();
  try {
    await login(manager, businessB(), "Second synthetic Owner");
    await page.goto(businessUrl("/reservations/new", businessB()));
    await page
      .getByRole("button", { name: "Show all steps", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Guest", exact: true })
      .fill("Synthetic retained green draft");
    const list = await (
      await businessRequest(manager).get("/api/v1/staff")
    ).json();
    const owner = list.find(
      (staff: { email: string }) => staff.email === "owner@example.test",
    );
    const revoked = await businessRequest(manager).post(
      `/api/v1/staff/${owner.id}/revoke-sessions`,
      {
        headers: await headers(manager),
        data: { expectedVersion: owner.version },
      },
    );
    expect(revoked.ok()).toBeTruthy();
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByRole("heading", { name: "Business unavailable" }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Guest" }),
    ).not.toBeVisible();
    await page
      .getByRole("link", { name: `Open ${process.env.VILLAS_PROPERTY_NAME}` })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Business" }),
    ).not.toBeVisible();
    const deniedTab = await page.context().newPage();
    await deniedTab.goto(businessUrl("/rooms", businessB()));
    await expect(
      deniedTab.getByRole("heading", { name: "Business unavailable" }),
    ).toBeVisible();
    await renew(deniedTab);
    await expect(
      page.getByRole("combobox", { name: "Business" }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Business" })
      .selectOption(businessB());
    await expect(
      page.getByRole("combobox", { name: "Guest", exact: true }),
    ).toHaveValue("Synthetic retained green draft");
    await deniedTab.close();
  } finally {
    await controller.close();
  }
});
