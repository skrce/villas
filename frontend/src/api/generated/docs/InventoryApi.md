# InventoryApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**listMaintenanceBlocks**](InventoryApi.md#listmaintenanceblocks) | **GET** /maintenance-blocks | Read a bounded maintenance calendar page |
| [**listReservations**](InventoryApi.md#listreservations) | **GET** /reservations | Read a bounded overlapping-stay calendar page |
| [**maintenanceHistory**](InventoryApi.md#maintenancehistory) | **GET** /maintenance-blocks/{blockId}/events | Read a bounded maintenance event page |
| [**reservationHistory**](InventoryApi.md#reservationhistory) | **GET** /reservations/{reservationId}/events | Read a bounded reservation event page |



## listMaintenanceBlocks

> MaintenancePage listMaintenanceBlocks(startDate, endDate, status, afterId, limit)

Read a bounded maintenance calendar page

### Example

```ts
import {
  Configuration,
  InventoryApi,
} from '';
import type { ListMaintenanceBlocksRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new InventoryApi(config);

  const body = {
    // string
    startDate: startDate_example,
    // string
    endDate: endDate_example,
    // 'ACTIVE' | 'CANCELLED' (optional)
    status: status_example,
    // number (optional)
    afterId: 56,
    // number (optional)
    limit: 56,
  } satisfies ListMaintenanceBlocksRequest;

  try {
    const data = await api.listMaintenanceBlocks(body);
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
| **status** | `ACTIVE`, `CANCELLED` |  | [Optional] [Defaults to `undefined`] [Enum: ACTIVE, CANCELLED] |
| **afterId** | `number` |  | [Optional] [Defaults to `0`] |
| **limit** | `number` |  | [Optional] [Defaults to `100`] |

### Return type

[**MaintenancePage**](MaintenancePage.md)

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


## listReservations

> ReservationPage listReservations(startDate, endDate, status, afterId, limit)

Read a bounded overlapping-stay calendar page

### Example

```ts
import {
  Configuration,
  InventoryApi,
} from '';
import type { ListReservationsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new InventoryApi(config);

  const body = {
    // string
    startDate: startDate_example,
    // string
    endDate: endDate_example,
    // 'ACTIVE' | 'CANCELLED' (optional)
    status: status_example,
    // number (optional)
    afterId: 56,
    // number (optional)
    limit: 56,
  } satisfies ListReservationsRequest;

  try {
    const data = await api.listReservations(body);
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
| **status** | `ACTIVE`, `CANCELLED` |  | [Optional] [Defaults to `undefined`] [Enum: ACTIVE, CANCELLED] |
| **afterId** | `number` |  | [Optional] [Defaults to `0`] |
| **limit** | `number` |  | [Optional] [Defaults to `100`] |

### Return type

[**ReservationPage**](ReservationPage.md)

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


## maintenanceHistory

> InventoryEventPage maintenanceHistory(blockId, afterId, limit)

Read a bounded maintenance event page

### Example

```ts
import {
  Configuration,
  InventoryApi,
} from '';
import type { MaintenanceHistoryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new InventoryApi(config);

  const body = {
    // number
    blockId: 56,
    // string (optional)
    afterId: afterId_example,
    // number (optional)
    limit: 56,
  } satisfies MaintenanceHistoryRequest;

  try {
    const data = await api.maintenanceHistory(body);
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
| **blockId** | `number` |  | [Defaults to `undefined`] |
| **afterId** | `string` |  | [Optional] [Defaults to `&#39;0&#39;`] |
| **limit** | `number` |  | [Optional] [Defaults to `100`] |

### Return type

[**InventoryEventPage**](InventoryEventPage.md)

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


## reservationHistory

> InventoryEventPage reservationHistory(reservationId, afterId, limit)

Read a bounded reservation event page

### Example

```ts
import {
  Configuration,
  InventoryApi,
} from '';
import type { ReservationHistoryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new InventoryApi(config);

  const body = {
    // number
    reservationId: 56,
    // string (optional)
    afterId: afterId_example,
    // number (optional)
    limit: 56,
  } satisfies ReservationHistoryRequest;

  try {
    const data = await api.reservationHistory(body);
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
| **afterId** | `string` |  | [Optional] [Defaults to `&#39;0&#39;`] |
| **limit** | `number` |  | [Optional] [Defaults to `100`] |

### Return type

[**InventoryEventPage**](InventoryEventPage.md)

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

