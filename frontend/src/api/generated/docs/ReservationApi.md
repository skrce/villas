# ReservationApi

All URIs are relative to *http://localhost:9098*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**cancelReservation**](ReservationApi.md#cancelreservation) | **DELETE** /reservation | Cancel a reservation |
| [**createReservation**](ReservationApi.md#createreservation) | **POST** /reservation | Create a reservation |
| [**findAvailableApartments**](ReservationApi.md#findavailableapartments) | **GET** /reservation/available-apartments | Find available apartments for a date range |
| [**findReservationsByCustomer**](ReservationApi.md#findreservationsbycustomer) | **GET** /reservation/customer | Find reservations by customer |
| [**updateReservationRoom**](ReservationApi.md#updatereservationroom) | **PATCH** /reservation | Update a reservation\&#39;s room |



## cancelReservation

> cancelReservation(reservationId)

Cancel a reservation

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
    // number
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
| **reservationId** | `number` |  | [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

[basicAuth](../README.md#basicAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Reservation cancelled |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## createReservation

> number createReservation(customerId, roomId, startDate, endDate)

Create a reservation

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
    // number
    customerId: 56,
    // number
    roomId: 56,
    // string
    startDate: startDate_example,
    // string
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
| **customerId** | `number` |  | [Defaults to `undefined`] |
| **roomId** | `number` |  | [Defaults to `undefined`] |
| **startDate** | `string` |  | [Defaults to `undefined`] |
| **endDate** | `string` |  | [Defaults to `undefined`] |

### Return type

**number**

### Authorization

[basicAuth](../README.md#basicAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The new reservation ID |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## findAvailableApartments

> Array&lt;Apartment&gt; findAvailableApartments(startDate, endDate)

Find available apartments for a date range

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
    // string
    startDate: startDate_example,
    // string
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
| **startDate** | `string` |  | [Defaults to `undefined`] |
| **endDate** | `string` |  | [Defaults to `undefined`] |

### Return type

[**Array&lt;Apartment&gt;**](Apartment.md)

### Authorization

[basicAuth](../README.md#basicAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Available apartments |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## findReservationsByCustomer

> Array&lt;ReservationInfo&gt; findReservationsByCustomer(customerId)

Find reservations by customer

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
    // number
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
| **customerId** | `number` |  | [Defaults to `undefined`] |

### Return type

[**Array&lt;ReservationInfo&gt;**](ReservationInfo.md)

### Authorization

[basicAuth](../README.md#basicAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Customer reservations |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateReservationRoom

> updateReservationRoom(reservationId, newRoomId)

Update a reservation\&#39;s room

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
    // number
    reservationId: 56,
    // number
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
| **reservationId** | `number` |  | [Defaults to `undefined`] |
| **newRoomId** | `number` |  | [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

[basicAuth](../README.md#basicAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Reservation updated |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

