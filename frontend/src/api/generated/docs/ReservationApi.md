# ReservationApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**cancelReservation**](ReservationApi.md#cancelreservation) | **DELETE** /reservations | Retain a cancellation and release inventory |
| [**changeReservationDates**](ReservationApi.md#changereservationdates) | **PATCH** /reservations/{reservationId}/dates | Change stay dates and guest count |
| [**createReservation**](ReservationApi.md#createreservation) | **POST** /reservations | Create a reservation with an accepted quote and stable operation key |
| [**findAvailableApartments**](ReservationApi.md#findavailableapartments) | **GET** /reservations/available-apartments | Read advisory availability using the write-side overlap rules |
| [**findReservationsByCustomer**](ReservationApi.md#findreservationsbycustomer) | **GET** /reservations/customer | Read active reservations for a guest |
| [**getOperation**](ReservationApi.md#getoperation) | **GET** /operations/{operationKey} | Reconcile a write using its stable operation key |
| [**getReservation**](ReservationApi.md#getreservation) | **GET** /reservations/{reservationId} | Read the current reservation, including its version |
| [**updateReservationRoom**](ReservationApi.md#updatereservationroom) | **PATCH** /reservations | Move a reservation using its expected version |



## cancelReservation

> cancelReservation(reservationId, expectedVersion, idempotencyKey)

Retain a cancellation and release inventory

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
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new ReservationApi(config);

  const body = {
    // number
    reservationId: 56,
    // number
    expectedVersion: 789,
    // string
    idempotencyKey: idempotencyKey_example,
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
| **expectedVersion** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

[staffSession](../README.md#staffSession)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## changeReservationDates

> ReservationInfo changeReservationDates(reservationId, startDate, endDate, guestCount, expectedVersion, idempotencyKey)

Change stay dates and guest count

### Example

```ts
import {
  Configuration,
  ReservationApi,
} from '';
import type { ChangeReservationDatesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new ReservationApi(config);

  const body = {
    // number
    reservationId: 56,
    // string
    startDate: startDate_example,
    // string
    endDate: endDate_example,
    // number
    guestCount: 56,
    // number
    expectedVersion: 789,
    // string
    idempotencyKey: idempotencyKey_example,
  } satisfies ChangeReservationDatesRequest;

  try {
    const data = await api.changeReservationDates(body);
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
| **startDate** | `string` |  | [Defaults to `undefined`] |
| **endDate** | `string` |  | [Defaults to `undefined`] |
| **guestCount** | `number` |  | [Defaults to `undefined`] |
| **expectedVersion** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ReservationInfo**](ReservationInfo.md)

### Authorization

[staffSession](../README.md#staffSession)

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

> number createReservation(customerId, roomId, startDate, endDate, idempotencyKey, guestCount, quoteId)

Create a reservation with an accepted quote and stable operation key

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
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
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
    // string
    idempotencyKey: idempotencyKey_example,
    // number (optional)
    guestCount: 56,
    // string (optional)
    quoteId: quoteId_example,
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
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **guestCount** | `number` |  | [Optional] [Defaults to `1`] |
| **quoteId** | `string` |  | [Optional] [Defaults to `undefined`] |

### Return type

**number**

### Authorization

[staffSession](../README.md#staffSession)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## findAvailableApartments

> Array&lt;Apartment&gt; findAvailableApartments(startDate, endDate, guestCount)

Read advisory availability using the write-side overlap rules

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
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new ReservationApi(config);

  const body = {
    // string
    startDate: startDate_example,
    // string
    endDate: endDate_example,
    // number (optional)
    guestCount: 56,
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
| **guestCount** | `number` |  | [Optional] [Defaults to `1`] |

### Return type

[**Array&lt;Apartment&gt;**](Apartment.md)

### Authorization

[staffSession](../README.md#staffSession)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## findReservationsByCustomer

> Array&lt;ReservationInfo&gt; findReservationsByCustomer(customerId)

Read active reservations for a guest

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
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
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

[staffSession](../README.md#staffSession)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getOperation

> OperationResult getOperation(operationKey, kind)

Reconcile a write using its stable operation key

### Example

```ts
import {
  Configuration,
  ReservationApi,
} from '';
import type { GetOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new ReservationApi(config);

  const body = {
    // string
    operationKey: operationKey_example,
    // 'CREATE' | 'MOVE' | 'CHANGE' | 'CANCEL' | 'BLOCK' | 'UNBLOCK'
    kind: kind_example,
  } satisfies GetOperationRequest;

  try {
    const data = await api.getOperation(body);
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
| **operationKey** | `string` |  | [Defaults to `undefined`] |
| **kind** | `CREATE`, `MOVE`, `CHANGE`, `CANCEL`, `BLOCK`, `UNBLOCK` |  | [Defaults to `undefined`] [Enum: CREATE, MOVE, CHANGE, CANCEL, BLOCK, UNBLOCK] |

### Return type

[**OperationResult**](OperationResult.md)

### Authorization

[staffSession](../README.md#staffSession)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getReservation

> ReservationInfo getReservation(reservationId)

Read the current reservation, including its version

### Example

```ts
import {
  Configuration,
  ReservationApi,
} from '';
import type { GetReservationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new ReservationApi(config);

  const body = {
    // number
    reservationId: 56,
  } satisfies GetReservationRequest;

  try {
    const data = await api.getReservation(body);
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

[**ReservationInfo**](ReservationInfo.md)

### Authorization

[staffSession](../README.md#staffSession)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateReservationRoom

> updateReservationRoom(reservationId, newRoomId, expectedVersion, idempotencyKey)

Move a reservation using its expected version

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
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new ReservationApi(config);

  const body = {
    // number
    reservationId: 56,
    // number
    newRoomId: 56,
    // number
    expectedVersion: 789,
    // string
    idempotencyKey: idempotencyKey_example,
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
| **expectedVersion** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

[staffSession](../README.md#staffSession)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

