# OperationsApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**cancelStay**](OperationsApi.md#cancelstay) | **POST** /reservations/{id}/cancel | Record a reasoned cancellation without an automatic refund |
| [**changeRoomReadiness**](OperationsApi.md#changeroomreadiness) | **POST** /apartments/{roomId}/readiness | Record a reviewed room-readiness transition |
| [**changeStay**](OperationsApi.md#changestay) | **POST** /reservations/{id}/change | Accept a new whole-stay quote and change reviewed dates or party size |
| [**checkInStay**](OperationsApi.md#checkinstay) | **POST** /reservations/{id}/check-in | Record arrival within the booked dates into a reviewed clean room |
| [**checkOutStay**](OperationsApi.md#checkoutstay) | **POST** /reservations/{id}/check-out | Record departure and mark its room dirty in one transaction |
| [**correctStayTimes**](OperationsApi.md#correctstaytimes) | **POST** /reservations/{id}/actual-times | Correct actual arrival/departure times with a retained Owner reason |
| [**frontDesk**](OperationsApi.md#frontdesk) | **GET** /front-desk | Read bounded arrival, departure, in-house and attention lists for the property day |
| [**housekeeping**](OperationsApi.md#housekeeping) | **GET** /housekeeping | Read room readiness, physical occupancy and dated maintenance without guest or financial data |
| [**moveStay**](OperationsApi.md#movestay) | **POST** /reservations/{id}/move | Accept a new whole-stay quote and move a confirmed or in-house stay |
| [**propertyTimeOptions**](OperationsApi.md#propertytimeoptions) | **POST** /property-time/options | Resolve a Skopje time to explicit UTC choices, including repeated or missing daylight-saving times |
| [**recordNoShow**](OperationsApi.md#recordnoshow) | **POST** /reservations/{id}/no-show | Record a reasoned no-show after the arrival day |
| [**reservationAllocations**](OperationsApi.md#reservationallocations) | **GET** /reservations/{id}/allocations | Read versioned dated room allocations without changing the whole-stay price |
| [**roomReadiness**](OperationsApi.md#roomreadiness) | **GET** /apartments/{roomId}/readiness | Read current room readiness without guest or financial data |
| [**roomReadinessHistory**](OperationsApi.md#roomreadinesshistory) | **GET** /apartments/{roomId}/readiness/events | Read bounded room-readiness history |



## cancelStay

> OperationResult cancelStay(id, idempotencyKey, stayReasonRequest)

Record a reasoned cancellation without an automatic refund

### Example

```ts
import {
  Configuration,
  OperationsApi,
} from '';
import type { CancelStayRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new OperationsApi(config);

  const body = {
    // number
    id: 56,
    // string
    idempotencyKey: idempotencyKey_example,
    // StayReasonRequest
    stayReasonRequest: ...,
  } satisfies CancelStayRequest;

  try {
    const data = await api.cancelStay(body);
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
| **id** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **stayReasonRequest** | [StayReasonRequest](StayReasonRequest.md) |  | |

### Return type

[**OperationResult**](OperationResult.md)

### Authorization

[staffSession](../README.md#staffSession)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## changeRoomReadiness

> OperationResult changeRoomReadiness(roomId, idempotencyKey, readinessChangeRequest)

Record a reviewed room-readiness transition

### Example

```ts
import {
  Configuration,
  OperationsApi,
} from '';
import type { ChangeRoomReadinessRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new OperationsApi(config);

  const body = {
    // number
    roomId: 56,
    // string
    idempotencyKey: idempotencyKey_example,
    // ReadinessChangeRequest
    readinessChangeRequest: ...,
  } satisfies ChangeRoomReadinessRequest;

  try {
    const data = await api.changeRoomReadiness(body);
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
| **roomId** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **readinessChangeRequest** | [ReadinessChangeRequest](ReadinessChangeRequest.md) |  | |

### Return type

[**OperationResult**](OperationResult.md)

### Authorization

[staffSession](../README.md#staffSession)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## changeStay

> OperationResult changeStay(id, idempotencyKey, operationalChangeRequest)

Accept a new whole-stay quote and change reviewed dates or party size

### Example

```ts
import {
  Configuration,
  OperationsApi,
} from '';
import type { ChangeStayRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new OperationsApi(config);

  const body = {
    // number
    id: 56,
    // string
    idempotencyKey: idempotencyKey_example,
    // OperationalChangeRequest
    operationalChangeRequest: ...,
  } satisfies ChangeStayRequest;

  try {
    const data = await api.changeStay(body);
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
| **id** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **operationalChangeRequest** | [OperationalChangeRequest](OperationalChangeRequest.md) |  | |

### Return type

[**OperationResult**](OperationResult.md)

### Authorization

[staffSession](../README.md#staffSession)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## checkInStay

> OperationResult checkInStay(id, idempotencyKey, checkInRequest)

Record arrival within the booked dates into a reviewed clean room

### Example

```ts
import {
  Configuration,
  OperationsApi,
} from '';
import type { CheckInStayRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new OperationsApi(config);

  const body = {
    // number
    id: 56,
    // string
    idempotencyKey: idempotencyKey_example,
    // CheckInRequest
    checkInRequest: ...,
  } satisfies CheckInStayRequest;

  try {
    const data = await api.checkInStay(body);
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
| **id** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **checkInRequest** | [CheckInRequest](CheckInRequest.md) |  | |

### Return type

[**OperationResult**](OperationResult.md)

### Authorization

[staffSession](../README.md#staffSession)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## checkOutStay

> OperationResult checkOutStay(id, idempotencyKey, checkOutRequest)

Record departure and mark its room dirty in one transaction

### Example

```ts
import {
  Configuration,
  OperationsApi,
} from '';
import type { CheckOutStayRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new OperationsApi(config);

  const body = {
    // number
    id: 56,
    // string
    idempotencyKey: idempotencyKey_example,
    // CheckOutRequest
    checkOutRequest: ...,
  } satisfies CheckOutStayRequest;

  try {
    const data = await api.checkOutStay(body);
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
| **id** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **checkOutRequest** | [CheckOutRequest](CheckOutRequest.md) |  | |

### Return type

[**OperationResult**](OperationResult.md)

### Authorization

[staffSession](../README.md#staffSession)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## correctStayTimes

> OperationResult correctStayTimes(id, idempotencyKey, actualTimesRequest)

Correct actual arrival/departure times with a retained Owner reason

### Example

```ts
import {
  Configuration,
  OperationsApi,
} from '';
import type { CorrectStayTimesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new OperationsApi(config);

  const body = {
    // number
    id: 56,
    // string
    idempotencyKey: idempotencyKey_example,
    // ActualTimesRequest
    actualTimesRequest: ...,
  } satisfies CorrectStayTimesRequest;

  try {
    const data = await api.correctStayTimes(body);
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
| **id** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **actualTimesRequest** | [ActualTimesRequest](ActualTimesRequest.md) |  | |

### Return type

[**OperationResult**](OperationResult.md)

### Authorization

[staffSession](../README.md#staffSession)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## frontDesk

> FrontDeskPage frontDesk(list, afterId, limit, expectedDate)

Read bounded arrival, departure, in-house and attention lists for the property day

### Example

```ts
import {
  Configuration,
  OperationsApi,
} from '';
import type { FrontDeskRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new OperationsApi(config);

  const body = {
    // 'ARRIVALS' | 'DEPARTURES' | 'IN_HOUSE' | 'ATTENTION' (optional)
    list: list_example,
    // number (optional)
    afterId: 56,
    // number (optional)
    limit: 56,
    // string (optional)
    expectedDate: expectedDate_example,
  } satisfies FrontDeskRequest;

  try {
    const data = await api.frontDesk(body);
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
| **list** | `ARRIVALS`, `DEPARTURES`, `IN_HOUSE`, `ATTENTION` |  | [Optional] [Defaults to `&#39;ARRIVALS&#39;`] [Enum: ARRIVALS, DEPARTURES, IN_HOUSE, ATTENTION] |
| **afterId** | `number` |  | [Optional] [Defaults to `0`] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |
| **expectedDate** | `string` |  | [Optional] [Defaults to `undefined`] |

### Return type

[**FrontDeskPage**](FrontDeskPage.md)

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


## housekeeping

> HousekeepingPage housekeeping(afterId, limit, state, expectedDate)

Read room readiness, physical occupancy and dated maintenance without guest or financial data

### Example

```ts
import {
  Configuration,
  OperationsApi,
} from '';
import type { HousekeepingRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new OperationsApi(config);

  const body = {
    // number (optional)
    afterId: 56,
    // number (optional)
    limit: 56,
    // 'DIRTY' | 'IN_PROGRESS' | 'INSPECTION' | 'CLEAN' (optional)
    state: state_example,
    // string (optional)
    expectedDate: expectedDate_example,
  } satisfies HousekeepingRequest;

  try {
    const data = await api.housekeeping(body);
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
| **afterId** | `number` |  | [Optional] [Defaults to `0`] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |
| **state** | `DIRTY`, `IN_PROGRESS`, `INSPECTION`, `CLEAN` |  | [Optional] [Defaults to `undefined`] [Enum: DIRTY, IN_PROGRESS, INSPECTION, CLEAN] |
| **expectedDate** | `string` |  | [Optional] [Defaults to `undefined`] |

### Return type

[**HousekeepingPage**](HousekeepingPage.md)

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


## moveStay

> OperationResult moveStay(id, idempotencyKey, operationalMoveRequest)

Accept a new whole-stay quote and move a confirmed or in-house stay

### Example

```ts
import {
  Configuration,
  OperationsApi,
} from '';
import type { MoveStayRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new OperationsApi(config);

  const body = {
    // number
    id: 56,
    // string
    idempotencyKey: idempotencyKey_example,
    // OperationalMoveRequest
    operationalMoveRequest: ...,
  } satisfies MoveStayRequest;

  try {
    const data = await api.moveStay(body);
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
| **id** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **operationalMoveRequest** | [OperationalMoveRequest](OperationalMoveRequest.md) |  | |

### Return type

[**OperationResult**](OperationResult.md)

### Authorization

[staffSession](../README.md#staffSession)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## propertyTimeOptions

> PropertyTimeOptions propertyTimeOptions(propertyTimeRequest)

Resolve a Skopje time to explicit UTC choices, including repeated or missing daylight-saving times

### Example

```ts
import {
  Configuration,
  OperationsApi,
} from '';
import type { PropertyTimeOptionsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new OperationsApi(config);

  const body = {
    // PropertyTimeRequest
    propertyTimeRequest: ...,
  } satisfies PropertyTimeOptionsRequest;

  try {
    const data = await api.propertyTimeOptions(body);
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
| **propertyTimeRequest** | [PropertyTimeRequest](PropertyTimeRequest.md) |  | |

### Return type

[**PropertyTimeOptions**](PropertyTimeOptions.md)

### Authorization

[staffSession](../README.md#staffSession)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## recordNoShow

> OperationResult recordNoShow(id, idempotencyKey, stayReasonRequest)

Record a reasoned no-show after the arrival day

### Example

```ts
import {
  Configuration,
  OperationsApi,
} from '';
import type { RecordNoShowRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new OperationsApi(config);

  const body = {
    // number
    id: 56,
    // string
    idempotencyKey: idempotencyKey_example,
    // StayReasonRequest
    stayReasonRequest: ...,
  } satisfies RecordNoShowRequest;

  try {
    const data = await api.recordNoShow(body);
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
| **id** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **stayReasonRequest** | [StayReasonRequest](StayReasonRequest.md) |  | |

### Return type

[**OperationResult**](OperationResult.md)

### Authorization

[staffSession](../README.md#staffSession)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## reservationAllocations

> RoomAllocationPage reservationAllocations(id, afterId, limit, expectedVersion)

Read versioned dated room allocations without changing the whole-stay price

### Example

```ts
import {
  Configuration,
  OperationsApi,
} from '';
import type { ReservationAllocationsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new OperationsApi(config);

  const body = {
    // number
    id: 56,
    // string (optional)
    afterId: afterId_example,
    // number (optional)
    limit: 56,
    // number (optional)
    expectedVersion: 789,
  } satisfies ReservationAllocationsRequest;

  try {
    const data = await api.reservationAllocations(body);
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
| **id** | `number` |  | [Defaults to `undefined`] |
| **afterId** | `string` |  | [Optional] [Defaults to `&#39;0&#39;`] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |
| **expectedVersion** | `number` |  | [Optional] [Defaults to `undefined`] |

### Return type

[**RoomAllocationPage**](RoomAllocationPage.md)

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


## roomReadiness

> ReadinessView roomReadiness(roomId)

Read current room readiness without guest or financial data

### Example

```ts
import {
  Configuration,
  OperationsApi,
} from '';
import type { RoomReadinessRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new OperationsApi(config);

  const body = {
    // number
    roomId: 56,
  } satisfies RoomReadinessRequest;

  try {
    const data = await api.roomReadiness(body);
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
| **roomId** | `number` |  | [Defaults to `undefined`] |

### Return type

[**ReadinessView**](ReadinessView.md)

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


## roomReadinessHistory

> ReadinessHistory roomReadinessHistory(roomId, afterId, limit)

Read bounded room-readiness history

### Example

```ts
import {
  Configuration,
  OperationsApi,
} from '';
import type { RoomReadinessHistoryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new OperationsApi(config);

  const body = {
    // number
    roomId: 56,
    // string (optional)
    afterId: afterId_example,
    // number (optional)
    limit: 56,
  } satisfies RoomReadinessHistoryRequest;

  try {
    const data = await api.roomReadinessHistory(body);
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
| **roomId** | `number` |  | [Defaults to `undefined`] |
| **afterId** | `string` |  | [Optional] [Defaults to `&#39;0&#39;`] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |

### Return type

[**ReadinessHistory**](ReadinessHistory.md)

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

