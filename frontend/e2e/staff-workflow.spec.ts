import { expect, test } from '@playwright/test';

test('staff can create a guest and move and cancel a persisted booking', async ({ page, request }) => {
  const password = process.env.VILLAS_LOCAL_PASSWORD;
  if (!password || !process.env.VILLAS_LOCAL_INSTANCE?.startsWith('e2e-')) {
    throw new Error('Run npm run test:e2e to use a disposable Villas database.');
  }
  const headers = { Authorization: `Basic ${Buffer.from(`test:${password}`).toString('base64')}` };
  await page.goto('/');
  const settings = page.getByRole('form', { name: 'API settings' });
  await settings.getByLabel('Password').fill(password);
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await page.getByRole('button', { name: 'Load apartments' }).click();
  await expect(page.getByRole('cell', { name: 'Synthetic lake room' })).toBeVisible();

  const guestForm = page.getByRole('form', { name: 'Create customer', exact: true });
  await guestForm.getByLabel('First name').fill('BrowserTest');
  await guestForm.getByLabel('Last name').fill('Гостин');
  await guestForm.getByLabel('Phone').fill('000');
  await guestForm.getByLabel('Address').fill('Synthetic test record');
  await guestForm.getByRole('button', { name: 'Create customer', exact: true }).click();
  await expect(guestForm.getByText(/^ID \d+$/)).toBeVisible();
  const customerId = Number((await guestForm.getByText(/^ID \d+$/).innerText()).replace('ID ', ''));

  const roomsResponse = await request.get('/api/v1/apartments', { headers });
  expect(roomsResponse.ok()).toBeTruthy();
  const rooms: { id: number }[] = await roomsResponse.json();
  const create = await request.post('/api/v1/reservations', {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    params: { customerId, roomId: rooms[0].id, startDate: '2026-11-06', endDate: '2026-11-09' },
  });
  expect(create.ok()).toBeTruthy();
  const reservationId: number = await create.json();

  const move = page.getByRole('form', { name: 'Move reservation' });
  await move.getByLabel('Reservation ID', { exact: true }).fill(String(reservationId));
  await move.getByLabel('New room ID').fill(String(rooms[1].id));
  await move.getByRole('button', { name: 'Update room' }).click();
  await expect(page.getByText('Reservation updated.', { exact: true })).toBeVisible();
  const moved = await request.get('/api/v1/reservations/customer', { headers, params: { customerId } });
  expect(moved.ok()).toBeTruthy();
  expect(await moved.json()).toEqual([expect.objectContaining({ roomId: rooms[1].id })]);

  const cancel = page.getByRole('form', { name: 'Cancel reservation', exact: true });
  await cancel.getByLabel('Reservation ID').fill(String(reservationId));
  await cancel.getByRole('button', { name: 'Cancel reservation' }).click();
  await expect(page.getByText('Reservation cancelled.', { exact: true })).toBeVisible();
  const cancelled = await request.get('/api/v1/reservations/customer', { headers, params: { customerId } });
  expect(cancelled.ok()).toBeTruthy();
  expect(await cancelled.json()).toEqual([]);

  const search = page.getByRole('form', { name: 'Search customers' });
  await search.getByLabel('First name').fill('BrowserTest');
  await search.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Гостин', exact: true })).toBeVisible();
});

test('separate tabs share a pending booking key when one response is lost', async ({ page, context, request }) => {
  const password = process.env.VILLAS_LOCAL_PASSWORD;
  if (!password || !process.env.VILLAS_LOCAL_INSTANCE?.startsWith('e2e-')) {
    throw new Error('Run npm run test:e2e to use a disposable Villas database.');
  }
  const headers = { Authorization: `Basic ${Buffer.from(`test:${password}`).toString('base64')}` };
  const guest = await request.post('/api/v1/customers', {
    headers, params: { firstName: 'TabTest', lastName: 'Synthetic', phone: '000', address: 'Synthetic' },
  });
  expect(guest.ok()).toBeTruthy();
  const customerId: number = await guest.json();
  const rooms = await request.get('/api/v1/apartments', { headers });
  const roomId: number = (await rooms.json())[0].id;
  await page.goto('/');
  const settings = page.getByRole('form', { name: 'API settings' });
  await settings.getByLabel('Password').fill(password);
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  const other = await context.newPage();
  await other.goto('/');
  for (const tab of [page, other]) {
    const form = tab.getByRole('form', { name: 'Create reservation', exact: true });
    await form.getByLabel('Customer ID').fill(String(customerId));
    await form.getByLabel('Room ID').fill(String(roomId));
    await form.getByLabel('Guest count').fill('2');
    await form.getByLabel('Start date').fill('2026-11-12');
    await form.getByLabel('End date').fill('2026-11-14');
    await form.getByLabel('End date').press('Tab');
  }
  let releaseFirst: () => void = () => {};
  const firstCanFinish = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let firstStarted: () => void = () => {};
  const firstInFlight = new Promise<void>((resolve) => { firstStarted = resolve; });
  const keys: string[] = [];
  await page.route('**/api/v1/reservations?**', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    keys.push(route.request().headers()['idempotency-key']);
    firstStarted();
    await firstCanFinish;
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    await route.abort('failed');
  });
  await other.route('**/api/v1/reservations?**', async (route) => {
    if (route.request().method() === 'POST') {
      keys.push(route.request().headers()['idempotency-key']);
      releaseFirst();
    }
    await route.continue();
  });
  try {
    await page.getByRole('button', { name: 'Create reservation', exact: true }).click();
    await firstInFlight;
    await other.getByRole('button', { name: 'Create reservation', exact: true }).click();
    await expect(other.getByRole('form', { name: 'Create reservation', exact: true }).getByText(/^ID \d+$/)).toBeVisible();
    await expect(page.getByText('The request could not be confirmed. Check the records before retrying.')).toBeVisible();
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(1);
    const saved = await request.get('/api/v1/reservations/customer', { headers, params: { customerId } });
    expect(await saved.json()).toEqual([expect.objectContaining({ guestCount: 2, nights: 2 })]);
  } finally {
    releaseFirst();
    await other.close();
  }
});
