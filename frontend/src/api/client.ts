import {
  ApartmentApi,
  Configuration,
  CustomerApi,
  ReservationApi,
} from './generated';

export type ApiConfig = {
  basePath: string;
  username: string;
  password: string;
};

export const buildApis = (config: ApiConfig) => {
  const configuration = new Configuration({
    basePath: config.basePath,
    username: config.username,
    password: config.password,
  });

  return {
    apartmentApi: new ApartmentApi(configuration),
    customerApi: new CustomerApi(configuration),
    reservationApi: new ReservationApi(configuration),
  };
};
