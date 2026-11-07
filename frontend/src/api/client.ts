import {
  ApartmentApi,
  Configuration,
  CustomerApi,
  ReservationApi,
  StaffApi,
  InventoryApi,
  MaintenanceApi,
  RatesApi,
  QuotesApi,
  CalendarApi,
  PaymentsApi,
  OperationsApi,
  ReportsApi,
} from './generated';
import { API_BASE, scopedSessionFetch } from './session';

export const buildApis = (staffId: string, epoch: number) => {
  const configuration = new Configuration({
    basePath: API_BASE,
    fetchApi: scopedSessionFetch(staffId, epoch),
    credentials: 'same-origin',
  });

  return {
    apartmentApi: new ApartmentApi(configuration),
    customerApi: new CustomerApi(configuration),
    reservationApi: new ReservationApi(configuration),
    staffApi: new StaffApi(configuration),
    inventoryApi: new InventoryApi(configuration),
    maintenanceApi: new MaintenanceApi(configuration),
    ratesApi: new RatesApi(configuration),
    quotesApi: new QuotesApi(configuration),
    calendarApi: new CalendarApi(configuration),
    paymentsApi: new PaymentsApi(configuration),
    operationsApi: new OperationsApi(configuration),
    reportsApi: new ReportsApi(configuration),
  };
};
