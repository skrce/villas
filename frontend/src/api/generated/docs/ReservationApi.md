# ReservationApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**cancelReservation**](ReservationApi.md#cancelreservation) | **DELETE** /reservations | Deletes a reservation. |
| [**createReservation**](ReservationApi.md#createreservation) | **POST** /reservations | Creates a reservation (for room and customer). |
| [**findAvailableApartments**](ReservationApi.md#findavailableapartments) | **GET** /reservations/available-apartments | Find all available apartments available for a date range. |
| [**findReservationsByCustomer**](ReservationApi.md#findreservationsbycustomer) | **GET** /reservations/customer | Find all reservations for a given customer. |
| [**updateReservationRoom**](ReservationApi.md#updatereservationroom) | **PATCH** /reservations | Updates a reservation\&#39;s room. |



## cancelReservation

> cancelReservation(reservationId)

Deletes a reservation.

### Example

```ts
import {
  Configuration,
  ReservationApi,
} from '';
import type { CancelReservationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure HTTP basic authorization: basicAuth
    username: "YOUR USERNAME",
    password: "YOUR PASSWORD",
  });
  const api = new ReservationApi(config);

  const body = {
    // number | Reservation ID
    reservationId: 56,
  } satisfies CancelReservationRequest;

  try {
    const data = await api.cancelReservation(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **reservationId** | `number` | Reservation ID | [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

[basicAuth](../README.md#basicAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## createReservation

> number createReservation(customerId, roomId, startDate, endDate)

Creates a reservation (for room and customer).

### Example

```ts
import {
  Configuration,
  ReservationApi,
} from '';
import type { CreateReservationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure HTTP basic authorization: basicAuth
    username: "YOUR USERNAME",
    password: "YOUR PASSWORD",
  });
  const api = new ReservationApi(config);

  const body = {
    // number | Customer ID
    customerId: 56,
    // number | Room ID
    roomId: 56,
    // string | Start Date, format: YYYY-MM-DD
    startDate: startDate_example,
    // string | End Date, format: YYYY-MM-DD
    endDate: endDate_example,
  } satisfies CreateReservationRequest;

  try {
    const data = await api.createReservation(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **customerId** | `number` | Customer ID | [Defaults to `undefined`] |
| **roomId** | `number` | Room ID | [Defaults to `undefined`] |
| **startDate** | `string` | Start Date, format: YYYY-MM-DD | [Defaults to `undefined`] |
| **endDate** | `string` | End Date, format: YYYY-MM-DD | [Defaults to `undefined`] |

### Return type

**number**

### Authorization

[basicAuth](../README.md#basicAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`, `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## findAvailableApartments

> Array&lt;Apartment&gt; findAvailableApartments(startDate, endDate)

Find all available apartments available for a date range.

### Example

```ts
import {
  Configuration,
  ReservationApi,
} from '';
import type { FindAvailableApartmentsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure HTTP basic authorization: basicAuth
    username: "YOUR USERNAME",
    password: "YOUR PASSWORD",
  });
  const api = new ReservationApi(config);

  const body = {
    // string | Start Date, format: YYYY-MM-DD
    startDate: startDate_example,
    // string | End Date, format: YYYY-MM-DD
    endDate: endDate_example,
  } satisfies FindAvailableApartmentsRequest;

  try {
    const data = await api.findAvailableApartments(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **startDate** | `string` | Start Date, format: YYYY-MM-DD | [Defaults to `undefined`] |
| **endDate** | `string` | End Date, format: YYYY-MM-DD | [Defaults to `undefined`] |

### Return type

[**Array&lt;Apartment&gt;**](Apartment.md)

### Authorization

[basicAuth](../README.md#basicAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`, `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## findReservationsByCustomer

> Array&lt;ReservationInfo&gt; findReservationsByCustomer(customerId)

Find all reservations for a given customer.

### Example

```ts
import {
  Configuration,
  ReservationApi,
} from '';
import type { FindReservationsByCustomerRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure HTTP basic authorization: basicAuth
    username: "YOUR USERNAME",
    password: "YOUR PASSWORD",
  });
  const api = new ReservationApi(config);

  const body = {
    // number | Customer ID
    customerId: 56,
  } satisfies FindReservationsByCustomerRequest;

  try {
    const data = await api.findReservationsByCustomer(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **customerId** | `number` | Customer ID | [Defaults to `undefined`] |

### Return type

[**Array&lt;ReservationInfo&gt;**](ReservationInfo.md)

### Authorization

[basicAuth](../README.md#basicAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`, `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateReservationRoom

> updateReservationRoom(reservationId, newRoomId)

Updates a reservation\&#39;s room.

### Example

```ts
import {
  Configuration,
  ReservationApi,
} from '';
import type { UpdateReservationRoomRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure HTTP basic authorization: basicAuth
    username: "YOUR USERNAME",
    password: "YOUR PASSWORD",
  });
  const api = new ReservationApi(config);

  const body = {
    // number | Reservation ID
    reservationId: 56,
    // number | New Room ID
    newRoomId: 56,
  } satisfies UpdateReservationRoomRequest;

  try {
    const data = await api.updateReservationRoom(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **reservationId** | `number` | Reservation ID | [Defaults to `undefined`] |
| **newRoomId** | `number` | New Room ID | [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

[basicAuth](../README.md#basicAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

