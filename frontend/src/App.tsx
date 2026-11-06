import type { FormEvent } from 'react';
import { useEffect, useId, useMemo, useState } from 'react';
import './App.css';
import { buildApis } from './api/client';
import { API_BASE, getSessionEpoch, getSessionOwnerKey, installSessionEvents, logout, refreshSession, startSignIn, useStaffSession } from './api/session';
import { buildBookingActions } from './api/bookingActions';
import type { Apartment, Customer, ReservationInfo } from './api/generated';
import { FetchError, ResponseError } from './api/generated';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

type Alert = {
  type: 'success' | 'error';
  message: string;
};

type CalendarInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

const formatValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return String(value);
};

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateString = (value: string): Date | null => {
  if (!value) {
    return null;
  }
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
};

const parseErrorMessage = async (error: unknown) => {
  if (error instanceof FetchError) {
    return 'The request could not be confirmed. Check the records before retrying.';
  }
  if (error instanceof ResponseError) {
    const body = await error.response.text();
    const details = body ? ` - ${body}` : '';
    return `${error.response.status} ${error.response.statusText}${details}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unexpected error.';
};

const CalendarInput = ({ label, value, onChange, placeholder }: CalendarInputProps) => {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}><span>{label}</span></label>
      <DatePicker
        id={id}
        selected={parseDateString(value)}
        onChange={(date: Date | null) => onChange(date ? formatDate(date) : '')}
        dateFormat="yyyy-MM-dd"
        placeholderText={placeholder ?? 'YYYY-MM-DD'}
        className="date-input"
        showPopperArrow={false}
        popperPlacement="bottom-start"
        isClearable
        showIcon
        toggleCalendarOnIconClick
      />
    </div>
  );
};

function Login() {
  const session = useStaffSession();
  const [error, setError] = useState('');
  return <main className="page"><section className="card"><p className="eyebrow">Villas staff workspace</p><h1>Welcome to Villas</h1>
    <p>Sign in with an invited Google account to manage your property.</p>
    {session.status !== 'loading' && session.provider === 'synthetic' && <p role="status">Local demo: synthetic accounts and test data.</p>}
    {session.status === 'loading' ? <p role="status">Checking your session…</p> : <>
      {session.status !== 'authenticated' && session.reason === 'expired' && <p role="alert">Your session expired. Sign in again, then review your entered details before submitting.</p>}
      {session.status !== 'authenticated' && session.reason === 'logout-unconfirmed' && <p role="alert">Sign-out could not be confirmed. Check your session before leaving this browser.</p>}
      {session.status === 'unavailable' && <p role="alert">{session.reason}</p>}
      {new URLSearchParams(window.location.search).has('error') && <p role="alert">Sign-in was declined. Use a verified account with an unexpired invitation.</p>}
      <button disabled={session.status !== 'authenticated' && session.reason === 'logout-pending'} className="btn primary" onClick={() => { try { startSignIn(); } catch (error) { setError(String(error)); } }}>Sign in{session.provider === 'synthetic' ? ' to local demo' : ' with Google'}</button>
      <button disabled={session.status !== 'authenticated' && session.reason === 'logout-pending'} className="btn" onClick={() => void refreshSession()}>Check session</button>
      {error && <p role="alert">{error} <a href="/auth/start" target="_blank" rel="noreferrer">Open sign-in</a></p>}
    </>}
  </section></main>;
}

function AuthReturn() {
  useEffect(() => {
    if (window.location.pathname === '/auth/start') { sessionStorage.setItem('villas.signinPopup', 'yes'); window.location.replace('/oauth2/authorization/google'); return; }
    const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('villas.session');
    const completed = () => { if (sessionStorage.getItem('villas.signinPopup')) { sessionStorage.removeItem('villas.signinPopup'); window.close(); } };
    channel?.addEventListener('message', (event) => { if (event.data === 'received') completed(); });
    void refreshSession().then(() => { channel?.postMessage('changed'); });
    return () => channel?.close();
  }, []);
  return <main className="page"><h1>Sign-in complete</h1><p>You can return to your Villas workspace.</p><a href="/">Open workspace</a></main>;
}

function App() {
  useStaffSession();
  useEffect(installSessionEvents, []);
  if (['/auth/start', '/auth/complete'].includes(window.location.pathname)) return <AuthReturn />;
  return <StaffConsole key={getSessionOwnerKey()} />;
}

function StaffConsole() {
  const session = useStaffSession();
  const ownerKey = getSessionOwnerKey();
  const sessionEpoch = getSessionEpoch();
  const apis = useMemo(() => buildApis(ownerKey, sessionEpoch), [ownerKey, sessionEpoch]);
  const [alert, setAlert] = useState<Alert | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [apartments, setApartments] = useState<Apartment[] | null>(null);
  const [availableApartments, setAvailableApartments] = useState<Apartment[] | null>(null);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [reservations, setReservations] = useState<ReservationInfo[] | null>(null);

  const [customerFirstName, setCustomerFirstName] = useState('');
  const [customerLastName, setCustomerLastName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  const [searchFirstName, setSearchFirstName] = useState('');
  const [searchPhone, setSearchPhone] = useState('');

  const [reservationCustomerId, setReservationCustomerId] = useState('');
  const [reservationRoomId, setReservationRoomId] = useState('');
  const [reservationStartDate, setReservationStartDate] = useState('');
  const [reservationEndDate, setReservationEndDate] = useState('');
  const [reservationGuestCount, setReservationGuestCount] = useState('1');

  const [availabilityStartDate, setAvailabilityStartDate] = useState('');
  const [availabilityEndDate, setAvailabilityEndDate] = useState('');
  const [availabilityGuestCount, setAvailabilityGuestCount] = useState('1');

  const [reservationsCustomerId, setReservationsCustomerId] = useState('');

  const bookingActions = useMemo(() => buildBookingActions(apis.reservationApi, JSON.stringify([API_BASE, ownerKey]), String(sessionEpoch)), [apis, ownerKey, sessionEpoch]);

  const [cancelReservationId, setCancelReservationId] = useState('');
  const [updateReservationId, setUpdateReservationId] = useState('');
  const [updateRoomId, setUpdateRoomId] = useState('');

  const [createdCustomerId, setCreatedCustomerId] = useState<number | null>(null);
  const [createdReservationId, setCreatedReservationId] = useState<number | null>(null);
  const [cancelStatus, setCancelStatus] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  const sessionReason = session.status === 'anonymous' || session.status === 'unavailable' ? session.reason : undefined;
  useEffect(() => {
    setApartments(null); setAvailableApartments(null); setCustomers(null); setReservations(null);
    setIsLoading(false); setAlert(null); setCreatedCustomerId(null); setCreatedReservationId(null); setCancelStatus(null); setUpdateStatus(null);
    if (session.status === 'anonymous' && sessionReason?.startsWith('logout')) {
      setCustomerFirstName(''); setCustomerLastName(''); setCustomerPhone(''); setCustomerAddress('');
      setSearchFirstName(''); setSearchPhone(''); setReservationCustomerId(''); setReservationsCustomerId('');
    }
  }, [sessionEpoch, session.status, sessionReason]);

  const stillCurrent = () => sessionEpoch === getSessionEpoch();

  const handleListApartments = async () => {
    setAlert(null);
    setIsLoading(true);
    try {
      const data = await apis.apartmentApi.listApartments();
      if (!stillCurrent()) return;
      setApartments(data);
      setAlert({ type: 'success', message: `Loaded ${data.length} apartments.` });
    } catch (error) {
      const message = await parseErrorMessage(error);
      if (stillCurrent()) setAlert({ type: 'error', message });
    } finally {
      if (stillCurrent()) setIsLoading(false);
    }
  };

  const handleCreateCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAlert(null);

    if (![customerFirstName, customerLastName, customerPhone, customerAddress].every((value) => value.trim())) {
      setAlert({ type: 'error', message: 'All customer fields are required.' });
      return;
    }

    setIsLoading(true);
    try {
      const id = await apis.customerApi.createCustomer({ customerCreateRequest: {
        firstName: customerFirstName.trim(),
        lastName: customerLastName.trim(),
        phone: customerPhone.trim(),
        address: customerAddress.trim(),
      } });
      if (!stillCurrent()) return;
      setCreatedCustomerId(id);
      setAlert({ type: 'success', message: `Customer created with ID ${id}.` });
    } catch (error) {
      const message = await parseErrorMessage(error);
      if (stillCurrent()) setAlert({ type: 'error', message });
    } finally {
      if (stillCurrent()) setIsLoading(false);
    }
  };

  const handleSearchCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAlert(null);

    if (!searchFirstName.trim() && !searchPhone.trim()) {
      setAlert({ type: 'error', message: 'Provide a first name or phone to search.' });
      return;
    }

    setIsLoading(true);
    try {
      const data = await apis.customerApi.searchCustomer({ customerSearchRequest: {
        firstName: searchFirstName.trim() || undefined,
        phone: searchPhone.trim() || undefined,
      } });
      if (!stillCurrent()) return;
      setCustomers(data);
      setAlert({ type: 'success', message: `Found ${data.length} customers.` });
    } catch (error) {
      const message = await parseErrorMessage(error);
      if (stillCurrent()) setAlert({ type: 'error', message });
    } finally {
      if (stillCurrent()) setIsLoading(false);
    }
  };

  const handleCreateReservation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAlert(null);

    if (!reservationCustomerId.trim() || !reservationRoomId.trim()) {
      setAlert({ type: 'error', message: 'Customer ID and Room ID are required.' });
      return;
    }
    if (!reservationStartDate || !reservationEndDate) {
      setAlert({ type: 'error', message: 'Start and end dates are required.' });
      return;
    }

    const customerId = Number(reservationCustomerId);
    const roomId = Number(reservationRoomId);
    if (!Number.isFinite(customerId) || !Number.isFinite(roomId)) {
      setAlert({ type: 'error', message: 'Customer ID and Room ID must be numbers.' });
      return;
    }
    const guestCount = Number(reservationGuestCount);
    if (!Number.isSafeInteger(guestCount) || guestCount <= 0) {
      setAlert({ type: 'error', message: 'Guest count must be a positive whole number.' });
      return;
    }

    setIsLoading(true);
    try {
      const id = await bookingActions.create({
        customerId,
        roomId,
        startDate: reservationStartDate,
        endDate: reservationEndDate,
        guestCount,
      });
      if (!stillCurrent()) return;
      setCreatedReservationId(id);
      setAlert({ type: 'success', message: `Reservation created with ID ${id}.` });
    } catch (error) {
      const message = await parseErrorMessage(error);
      if (stillCurrent()) setAlert({ type: 'error', message });
    } finally {
      if (stillCurrent()) setIsLoading(false);
    }
  };

  const handleFindAvailableApartments = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAlert(null);

    if (!availabilityStartDate || !availabilityEndDate) {
      setAlert({ type: 'error', message: 'Start and end dates are required.' });
      return;
    }
    const guestCount = Number(availabilityGuestCount);
    if (!Number.isSafeInteger(guestCount) || guestCount <= 0) {
      setAlert({ type: 'error', message: 'Guest count must be a positive whole number.' });
      return;
    }

    setIsLoading(true);
    try {
      const data = await apis.reservationApi.findAvailableApartments({
        startDate: availabilityStartDate,
        endDate: availabilityEndDate,
        guestCount,
      });
      if (!stillCurrent()) return;
      setAvailableApartments(data);
      setAlert({ type: 'success', message: `Found ${data.length} available apartments.` });
    } catch (error) {
      const message = await parseErrorMessage(error);
      if (stillCurrent()) setAlert({ type: 'error', message });
    } finally {
      if (stillCurrent()) setIsLoading(false);
    }
  };

  const handleFindReservationsByCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAlert(null);

    if (!reservationsCustomerId.trim()) {
      setAlert({ type: 'error', message: 'Customer ID is required.' });
      return;
    }

    const customerId = Number(reservationsCustomerId);
    if (!Number.isFinite(customerId)) {
      setAlert({ type: 'error', message: 'Customer ID must be a number.' });
      return;
    }

    setIsLoading(true);
    try {
      const data = await apis.reservationApi.findReservationsByCustomer({ customerId });
      if (!stillCurrent()) return;
      setReservations(data);
      setAlert({ type: 'success', message: `Loaded ${data.length} reservations.` });
    } catch (error) {
      const message = await parseErrorMessage(error);
      if (stillCurrent()) setAlert({ type: 'error', message });
    } finally {
      if (stillCurrent()) setIsLoading(false);
    }
  };

  const handleCancelReservation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAlert(null);

    if (!cancelReservationId.trim()) {
      setAlert({ type: 'error', message: 'Reservation ID is required.' });
      return;
    }

    const reservationId = Number(cancelReservationId);
    if (!Number.isFinite(reservationId)) {
      setAlert({ type: 'error', message: 'Reservation ID must be a number.' });
      return;
    }

    setIsLoading(true);
    try {
      await bookingActions.cancel(reservationId);
      if (!stillCurrent()) return;
      setCancelStatus(`Cancelled reservation ${reservationId}.`);
      setAlert({ type: 'success', message: 'Reservation cancelled.' });
    } catch (error) {
      const message = await parseErrorMessage(error);
      if (stillCurrent()) setAlert({ type: 'error', message });
    } finally {
      if (stillCurrent()) setIsLoading(false);
    }
  };

  const handleUpdateReservationRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAlert(null);

    if (!updateReservationId.trim() || !updateRoomId.trim()) {
      setAlert({ type: 'error', message: 'Reservation ID and new Room ID are required.' });
      return;
    }

    const reservationId = Number(updateReservationId);
    const newRoomId = Number(updateRoomId);
    if (!Number.isFinite(reservationId) || !Number.isFinite(newRoomId)) {
      setAlert({ type: 'error', message: 'Reservation ID and Room ID must be numbers.' });
      return;
    }

    setIsLoading(true);
    try {
      await bookingActions.move(reservationId, newRoomId);
      if (!stillCurrent()) return;
      setUpdateStatus(`Moved reservation ${reservationId} to room ${newRoomId}.`);
      setAlert({ type: 'success', message: 'Reservation updated.' });
    } catch (error) {
      const message = await parseErrorMessage(error);
      if (stillCurrent()) setAlert({ type: 'error', message });
    } finally {
      if (stillCurrent()) setIsLoading(false);
    }
  };

  const renderApartmentTable = (items: Apartment[] | null, emptyLabel: string) => {
    if (!items || items.length === 0) {
      return (
        <div className="table-wrap">
          <div className="empty-state">
            {items ? 'No results found.' : emptyLabel}
          </div>
        </div>
      );
    }
    return (
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Capacity</th>
              <th>Orientation</th>
              <th>View</th>
              <th>Regular Price</th>
              <th>Top Season Price</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id ?? `apt-${index}`}>
                <td>{formatValue(item.id)}</td>
                <td>{formatValue(item.capacity)}</td>
                <td>{formatValue(item.orientation)}</td>
                <td>{formatValue(item.view)}</td>
                <td>{formatValue(item.regularPrice)}</td>
                <td>{formatValue(item.topSeasonPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderCustomerTable = (items: Customer[] | null) => {
    if (!items || items.length === 0) {
      return (
        <div className="table-wrap">
          <div className="empty-state">
            {items ? 'No matching customers found.' : 'No search yet.'}
          </div>
        </div>
      );
    }
    return (
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>First Name</th>
              <th>Last Name</th>
              <th>Phone</th>
              <th>Address</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id ?? `cust-${index}`}>
                <td>{formatValue(item.id)}</td>
                <td>{formatValue(item.firstName)}</td>
                <td>{formatValue(item.lastName)}</td>
                <td>{formatValue(item.phone)}</td>
                <td>{formatValue(item.address)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderReservationTable = (items: ReservationInfo[] | null) => {
    if (!items || items.length === 0) {
      return (
        <div className="table-wrap">
          <div className="empty-state">
            {items ? 'No reservations for this customer.' : 'No reservations loaded.'}
          </div>
        </div>
      );
    }
    return (
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Customer ID</th>
              <th>Room ID</th>
              <th>Start Date</th>
              <th>End Date</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id ?? `res-${index}`}>
                <td>{formatValue(item.id)}</td>
                <td>{formatValue(item.customerId)}</td>
                <td>{formatValue(item.roomId)}</td>
                <td>{formatValue(item.startDate)}</td>
                <td>{formatValue(item.endDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (session.status !== 'authenticated') return <Login />;

  return (
    <div className="page">
      <header className="hero"><div><p className="eyebrow">Staff workspace</p><h1>Villas</h1><p>{session.staff.email} · Owner</p>
      {session.provider === 'synthetic' && <p role="status">Local demo: synthetic accounts and test data.</p>}</div>
      <button className="btn" onClick={() => void logout()}>Sign out</button></header>
      {alert && (
        <div className={`alert ${alert.type}`} role="status">
          {alert.message}
        </div>
      )}

      <section className="card" id="apartments">
        <div className="card-header">
          <h2>Apartments</h2>
          <p className="muted">List all apartments in the system.</p>
        </div>
        <div className="inline-actions">
          <button className="btn" onClick={handleListApartments} disabled={isLoading}>
            Load apartments
          </button>
        </div>
        {renderApartmentTable(apartments, 'No apartments loaded yet.')}
      </section>

      <section className="card" id="customers">
        <div className="card-header">
          <h2>Customers</h2>
          <p className="muted">Create new customers or search existing ones.</p>
        </div>
        <div className="panel-grid two-col">
          <div className="subcard">
            <h3>Create customer</h3>
            <form className="form-grid" aria-label="Create customer" onSubmit={handleCreateCustomer}>
              <label className="field">
                <span>First name</span>
                <input
                  type="text"
                  value={customerFirstName}
                  onChange={(event) => setCustomerFirstName(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Last name</span>
                <input
                  type="text"
                  value={customerLastName}
                  onChange={(event) => setCustomerLastName(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Phone</span>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Address</span>
                <input
                  type="text"
                  value={customerAddress}
                  onChange={(event) => setCustomerAddress(event.target.value)}
                />
              </label>
              <div className="form-actions">
                <button className="btn primary" type="submit" disabled={isLoading}>
                  Create customer
                </button>
                {createdCustomerId !== null && (
                  <span className="chip success">ID {createdCustomerId}</span>
                )}
              </div>
            </form>
          </div>

          <div className="subcard">
            <h3>Search customers</h3>
            <form className="form-grid" aria-label="Search customers" onSubmit={handleSearchCustomer}>
              <label className="field">
                <span>First name</span>
                <input
                  type="text"
                  value={searchFirstName}
                  onChange={(event) => setSearchFirstName(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Phone</span>
                <input
                  type="text"
                  value={searchPhone}
                  onChange={(event) => setSearchPhone(event.target.value)}
                />
              </label>
              <div className="form-actions">
                <button className="btn" type="submit" disabled={isLoading}>
                  Search
                </button>
              </div>
            </form>
            {renderCustomerTable(customers)}
          </div>
        </div>
      </section>

      <section className="card" id="reservations">
        <div className="card-header">
          <h2>Reservations</h2>
          <p className="muted">Create, inspect, or update reservations.</p>
        </div>
        <div className="panel-grid two-col">
          <div className="subcard">
            <h3>Create reservation</h3>
            <form className="form-grid" aria-label="Create reservation" onSubmit={handleCreateReservation}>
              <label className="field">
                <span>Customer ID</span>
                <input
                  type="number"
                  value={reservationCustomerId}
                  onChange={(event) => setReservationCustomerId(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Room ID</span>
                <input
                  type="number"
                  value={reservationRoomId}
                  onChange={(event) => setReservationRoomId(event.target.value)}
                />
              </label>
              <CalendarInput
                label="Start date"
                value={reservationStartDate}
                onChange={setReservationStartDate}
              />
              <CalendarInput
                label="End date"
                value={reservationEndDate}
                onChange={setReservationEndDate}
              />
              <label className="field">
                <span>Guest count</span>
                <input type="number" min="1" step="1" required value={reservationGuestCount}
                  onChange={(event) => setReservationGuestCount(event.target.value)} />
              </label>
              <div className="form-actions">
                <button className="btn primary" type="submit" disabled={isLoading}>
                  Create reservation
                </button>
                {createdReservationId !== null && (
                  <span className="chip success">ID {createdReservationId}</span>
                )}
              </div>
            </form>
          </div>

          <div className="subcard">
            <h3>Availability</h3>
            <form className="form-grid" aria-label="Find availability" onSubmit={handleFindAvailableApartments}>
              <CalendarInput
                label="Start date"
                value={availabilityStartDate}
                onChange={setAvailabilityStartDate}
              />
              <CalendarInput
                label="End date"
                value={availabilityEndDate}
                onChange={setAvailabilityEndDate}
              />
              <label className="field">
                <span>Guest count</span>
                <input type="number" min="1" step="1" required value={availabilityGuestCount}
                  onChange={(event) => setAvailabilityGuestCount(event.target.value)} />
              </label>
              <div className="form-actions">
                <button className="btn" type="submit" disabled={isLoading}>
                  Find availability
                </button>
              </div>
            </form>
            {renderApartmentTable(availableApartments, 'No availability lookup yet.')}
          </div>

          <div className="subcard">
            <h3>Reservations by customer</h3>
            <form className="form-grid" aria-label="Customer reservations" onSubmit={handleFindReservationsByCustomer}>
              <label className="field">
                <span>Customer ID</span>
                <input
                  type="number"
                  value={reservationsCustomerId}
                  onChange={(event) => setReservationsCustomerId(event.target.value)}
                />
              </label>
              <div className="form-actions">
                <button className="btn" type="submit" disabled={isLoading}>
                  Load reservations
                </button>
              </div>
            </form>
            {renderReservationTable(reservations)}
          </div>

          <div className="subcard">
            <h3>Cancel reservation</h3>
            <form className="form-grid" aria-label="Cancel reservation" onSubmit={handleCancelReservation}>
              <label className="field">
                <span>Reservation ID</span>
                <input
                  type="number"
                  value={cancelReservationId}
                  onChange={(event) => setCancelReservationId(event.target.value)}
                />
              </label>
              <div className="form-actions">
                <button className="btn danger" type="submit" disabled={isLoading}>
                  Cancel reservation
                </button>
                {cancelStatus && <span className="chip">{cancelStatus}</span>}
              </div>
            </form>
          </div>

          <div className="subcard">
            <h3>Update reservation room</h3>
            <form className="form-grid" aria-label="Move reservation" onSubmit={handleUpdateReservationRoom}>
              <label className="field">
                <span>Reservation ID</span>
                <input
                  type="number"
                  value={updateReservationId}
                  onChange={(event) => setUpdateReservationId(event.target.value)}
                />
              </label>
              <label className="field">
                <span>New room ID</span>
                <input
                  type="number"
                  value={updateRoomId}
                  onChange={(event) => setUpdateRoomId(event.target.value)}
                />
              </label>
              <div className="form-actions">
                <button className="btn" type="submit" disabled={isLoading}>
                  Update room
                </button>
                {updateStatus && <span className="chip">{updateStatus}</span>}
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}

export default App;
