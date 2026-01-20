import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import './App.css';
import { buildApis, type ApiConfig } from './api/client';
import type { Apartment, Customer, ReservationInfo } from './api/generated';
import { ResponseError } from './api/generated';
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

const STORAGE_KEY = 'villarosa.apiConfig';
const DEFAULT_CONFIG: ApiConfig = {
  basePath: '/api',
  username: 'test',
  password: '',
};

const normalizeBasePath = (value: string) =>
  value.trim().replace(/\/+$/, '');

const normalizeConfig = (config: ApiConfig): ApiConfig => {
  const normalizedBasePath = normalizeBasePath(
    config.basePath || DEFAULT_CONFIG.basePath,
  );
  const legacyBasePath = 'http://localhost:9098';
  return {
    basePath:
      normalizedBasePath === legacyBasePath
        ? DEFAULT_CONFIG.basePath
        : normalizedBasePath,
    username: config.username ?? DEFAULT_CONFIG.username,
    password: config.password ?? DEFAULT_CONFIG.password,
  };
};

const loadConfig = (): ApiConfig => {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_CONFIG;
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return DEFAULT_CONFIG;
  }

  try {
    const parsed = JSON.parse(saved) as ApiConfig;
    return normalizeConfig(parsed);
  } catch {
    return DEFAULT_CONFIG;
  }
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

const CalendarInput = ({ label, value, onChange, placeholder }: CalendarInputProps) => (
  <label className="field">
    <span>{label}</span>
    <DatePicker
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
  </label>
);

function App() {
  const [draftConfig, setDraftConfig] = useState<ApiConfig>(() => loadConfig());
  const [apiConfig, setApiConfig] = useState<ApiConfig>(() => loadConfig());
  const apis = useMemo(() => buildApis(apiConfig), [apiConfig]);

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

  const [availabilityStartDate, setAvailabilityStartDate] = useState('');
  const [availabilityEndDate, setAvailabilityEndDate] = useState('');

  const [reservationsCustomerId, setReservationsCustomerId] = useState('');

  const [cancelReservationId, setCancelReservationId] = useState('');
  const [updateReservationId, setUpdateReservationId] = useState('');
  const [updateRoomId, setUpdateRoomId] = useState('');

  const [createdCustomerId, setCreatedCustomerId] = useState<number | null>(null);
  const [createdReservationId, setCreatedReservationId] = useState<number | null>(null);
  const [cancelStatus, setCancelStatus] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  const handleApplyConfig = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextConfig = {
      ...draftConfig,
      basePath: normalizeBasePath(draftConfig.basePath),
    };
    setDraftConfig(nextConfig);
    setApiConfig(nextConfig);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextConfig));
    setAlert({ type: 'success', message: 'API settings updated.' });
  };

  const handleListApartments = async () => {
    setAlert(null);
    setIsLoading(true);
    try {
      const data = await apis.apartmentApi.listApartments();
      setApartments(data);
      setAlert({ type: 'success', message: `Loaded ${data.length} apartments.` });
    } catch (error) {
      setAlert({ type: 'error', message: await parseErrorMessage(error) });
    } finally {
      setIsLoading(false);
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
      const id = await apis.customerApi.createCustomer({
        firstName: customerFirstName.trim(),
        lastName: customerLastName.trim(),
        phone: customerPhone.trim(),
        address: customerAddress.trim(),
      });
      setCreatedCustomerId(id);
      setAlert({ type: 'success', message: `Customer created with ID ${id}.` });
    } catch (error) {
      setAlert({ type: 'error', message: await parseErrorMessage(error) });
    } finally {
      setIsLoading(false);
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
      const data = await apis.customerApi.searchCustomer({
        firstName: searchFirstName.trim() || undefined,
        phone: searchPhone.trim() || undefined,
      });
      setCustomers(data);
      setAlert({ type: 'success', message: `Found ${data.length} customers.` });
    } catch (error) {
      setAlert({ type: 'error', message: await parseErrorMessage(error) });
    } finally {
      setIsLoading(false);
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

    setIsLoading(true);
    try {
      const id = await apis.reservationApi.createReservation({
        customerId,
        roomId,
        startDate: reservationStartDate,
        endDate: reservationEndDate,
      });
      setCreatedReservationId(id);
      setAlert({ type: 'success', message: `Reservation created with ID ${id}.` });
    } catch (error) {
      setAlert({ type: 'error', message: await parseErrorMessage(error) });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFindAvailableApartments = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAlert(null);

    if (!availabilityStartDate || !availabilityEndDate) {
      setAlert({ type: 'error', message: 'Start and end dates are required.' });
      return;
    }

    setIsLoading(true);
    try {
      const data = await apis.reservationApi.findAvailableApartments({
        startDate: availabilityStartDate,
        endDate: availabilityEndDate,
      });
      setAvailableApartments(data);
      setAlert({ type: 'success', message: `Found ${data.length} available apartments.` });
    } catch (error) {
      setAlert({ type: 'error', message: await parseErrorMessage(error) });
    } finally {
      setIsLoading(false);
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
      setReservations(data);
      setAlert({ type: 'success', message: `Loaded ${data.length} reservations.` });
    } catch (error) {
      setAlert({ type: 'error', message: await parseErrorMessage(error) });
    } finally {
      setIsLoading(false);
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
      await apis.reservationApi.cancelReservation({ reservationId });
      setCancelStatus(`Cancelled reservation ${reservationId}.`);
      setAlert({ type: 'success', message: 'Reservation cancelled.' });
    } catch (error) {
      setAlert({ type: 'error', message: await parseErrorMessage(error) });
    } finally {
      setIsLoading(false);
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
      await apis.reservationApi.updateReservationRoom({ reservationId, newRoomId });
      setUpdateStatus(`Moved reservation ${reservationId} to room ${newRoomId}.`);
      setAlert({ type: 'success', message: 'Reservation updated.' });
    } catch (error) {
      setAlert({ type: 'error', message: await parseErrorMessage(error) });
    } finally {
      setIsLoading(false);
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

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Local Console</p>
          <h1 className="hero-title">Villarosa Front Desk</h1>
          <p className="hero-sub">
            A lightweight workspace for managing apartments, customers, and reservations.
          </p>
          <div className="chip-row">
            <span className="chip">API: {apiConfig.basePath}</span>
            <span className="chip">Auth: Basic</span>
          </div>
        </div>
        <div className="hero-panel">
          <h2>Connection Snapshot</h2>
          <p className="muted">Use the settings below to match your local backend.</p>
          <div className="panel-grid">
            <div>
              <span className="panel-label">User</span>
              <div className="panel-value">{apiConfig.username || '—'}</div>
            </div>
            <div>
              <span className="panel-label">Password</span>
              <div className="panel-value">{apiConfig.password ? '••••••' : 'Not set'}</div>
            </div>
          </div>
        </div>
      </header>

      {alert && (
        <div className={`alert ${alert.type}`} role="status">
          {alert.message}
        </div>
      )}

      <section className="card" id="api-settings">
        <div className="card-header">
          <h2>API Settings</h2>
          <p className="muted">
            Update the base URL and credentials used for all requests.
          </p>
        </div>
        <form className="form-grid" onSubmit={handleApplyConfig}>
          <label className="field">
            <span>Base URL</span>
            <input
              type="text"
              value={draftConfig.basePath}
              onChange={(event) =>
                setDraftConfig((prev) => ({
                  ...prev,
                  basePath: event.target.value,
                }))
              }
              placeholder="/api"
            />
          </label>
          <label className="field">
            <span>Username</span>
            <input
              type="text"
              value={draftConfig.username}
              onChange={(event) =>
                setDraftConfig((prev) => ({
                  ...prev,
                  username: event.target.value,
                }))
              }
              placeholder="test"
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={draftConfig.password}
              onChange={(event) =>
                setDraftConfig((prev) => ({
                  ...prev,
                  password: event.target.value,
                }))
              }
              placeholder="Local password"
            />
          </label>
          <div className="form-actions">
            <button className="btn primary" type="submit" disabled={isLoading}>
              Apply settings
            </button>
          </div>
        </form>
      </section>

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
            <form className="form-grid" onSubmit={handleCreateCustomer}>
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
            <form className="form-grid" onSubmit={handleSearchCustomer}>
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
            <form className="form-grid" onSubmit={handleCreateReservation}>
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
            <form className="form-grid" onSubmit={handleFindAvailableApartments}>
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
            <form className="form-grid" onSubmit={handleFindReservationsByCustomer}>
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
            <form className="form-grid" onSubmit={handleCancelReservation}>
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
            <form className="form-grid" onSubmit={handleUpdateReservationRoom}>
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
