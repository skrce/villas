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
