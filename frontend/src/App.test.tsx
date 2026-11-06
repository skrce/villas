import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const fetchMock = vi.fn<typeof fetch>();
const room = {
  id: 7,
  capacity: 2,
  orientation: 'South',
  view: 'Lake',
  regularPrice: 100,
  topSeasonPrice: 150,
};

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('staff console API integration', () => {
  it('loads apartments through the generated canonical client', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([room]), {
      headers: { 'Content-Type': 'application/json' },
    }));
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: 'Load apartments' }));

    expect(await screen.findByText('Loaded 1 apartments.')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Lake' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/apartments');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('GET');
  });

  it('rejects an incomplete guest before sending a request', async () => {
    render(<App />);
    const form = screen.getByRole('form', { name: 'Create customer' });

    await userEvent.click(within(form).getByRole('button', { name: 'Create customer' }));

    expect(await screen.findByText('All customer fields are required.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a request failure and allows a successful retry', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network unavailable'));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([room]), {
      headers: { 'Content-Type': 'application/json' },
    }));
    render(<App />);
    const load = screen.getByRole('button', { name: 'Load apartments' });

    await userEvent.click(load);
    expect(await screen.findByText('The request could not be confirmed. Check the records before retrying.')).toBeInTheDocument();
    await userEvent.click(load);

    expect(await screen.findByText('Loaded 1 apartments.')).toBeInTheDocument();
    expect(screen.queryByText('The request could not be confirmed. Check the records before retrying.')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not submit the same pending operation twice', async () => {
    let resolveRequest: (value: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    }));
    render(<App />);
    const load = screen.getByRole('button', { name: 'Load apartments' });

    await userEvent.click(load);
    expect(load).toBeDisabled();
    await userEvent.click(load);
    expect(fetchMock).toHaveBeenCalledOnce();
    resolveRequest(new Response('[]', { headers: { 'Content-Type': 'application/json' } }));

    await waitFor(() => expect(load).toBeEnabled());
  });

  it('cancels through the generated client without a trailing-slash failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 42, version: 0 }), { headers: { 'Content-Type': 'application/json' } }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({
      key: new Headers(fetchMock.mock.calls[1][1]?.headers).get('Idempotency-Key'),
      kind: 'CANCEL', resourceId: 42,
    }), { headers: { 'Content-Type': 'application/json' } }));
    render(<App />);
    const form = screen.getByRole('form', { name: 'Cancel reservation' });

    await userEvent.type(within(form).getByRole('spinbutton', { name: 'Reservation ID' }), '42');
    await userEvent.click(within(form).getByRole('button', { name: 'Cancel reservation' }));

    expect(await screen.findByText('Reservation cancelled.')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/reservations/42');
    const url = new URL(String(fetchMock.mock.calls[1][0]), 'http://local');
    expect(url.pathname).toBe('/api/v1/reservations');
    expect(url.searchParams.get('reservationId')).toBe('42');
    expect(url.searchParams.get('expectedVersion')).toBe('0');
    expect(fetchMock.mock.calls[1][1]?.method).toBe('DELETE');
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Idempotency-Key')).toMatch(/^[a-f0-9-]{36}$/);
  });

  it('migrates the stored legacy API prefix to the canonical prefix', async () => {
    localStorage.setItem('villarosa.apiConfig', JSON.stringify({
      basePath: '/api', username: 'test', password: '',
    }));
    fetchMock.mockResolvedValue(new Response('[]', {
      headers: { 'Content-Type': 'application/json' },
    }));
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: 'Load apartments' }));

    await screen.findByText('Loaded 0 apartments.');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/apartments');
  });

  it('includes the requested guest count in availability', async () => {
    fetchMock.mockResolvedValueOnce(new Response('[]', { headers: { 'Content-Type': 'application/json' } }));
    render(<App />);
    const form = screen.getByRole('form', { name: 'Find availability' });
    await userEvent.type(within(form).getByLabelText('Start date'), '2026-11-06');
    await userEvent.tab();
    await userEvent.type(within(form).getByLabelText('End date'), '2026-11-09');
    await userEvent.tab();
    const count = within(form).getByLabelText('Guest count');
    await userEvent.clear(count);
    await userEvent.type(count, '3');
    await userEvent.click(within(form).getByRole('button', { name: 'Find availability' }));
    expect(await screen.findByText('Found 0 available apartments.')).toBeInTheDocument();
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://local');
    expect(url.searchParams.get('guestCount')).toBe('3');
  });
});
