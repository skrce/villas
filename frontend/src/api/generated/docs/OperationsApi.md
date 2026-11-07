# OperationsApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**changeRoomReadiness**](OperationsApi.md#changeroomreadiness) | **POST** /apartments/{roomId}/readiness | Record a reviewed room-readiness transition |
| [**frontDesk**](OperationsApi.md#frontdesk) | **GET** /front-desk | Read bounded arrival, departure, in-house and attention lists for the property day |
| [**housekeeping**](OperationsApi.md#housekeeping) | **GET** /housekeeping | Read room readiness, physical occupancy and dated maintenance without guest or financial data |
| [**roomReadiness**](OperationsApi.md#roomreadiness) | **GET** /apartments/{roomId}/readiness | Read current room readiness without guest or financial data |
| [**roomReadinessHistory**](OperationsApi.md#roomreadinesshistory) | **GET** /apartments/{roomId}/readiness/events | Read bounded room-readiness history |



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

