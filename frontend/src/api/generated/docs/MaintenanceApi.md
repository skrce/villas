# MaintenanceApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**cancelMaintenanceBlock**](MaintenanceApi.md#cancelmaintenanceblock) | **DELETE** /maintenance-blocks/{blockId} | Retain a block cancellation and release inventory |
| [**createMaintenanceBlock**](MaintenanceApi.md#createmaintenanceblock) | **POST** /maintenance-blocks | Block a room only if no active inventory overlaps |



## cancelMaintenanceBlock

> MaintenanceBlock cancelMaintenanceBlock(blockId, expectedVersion, idempotencyKey)

Retain a block cancellation and release inventory

### Example

```ts
import {
  Configuration,
  MaintenanceApi,
} from '';
import type { CancelMaintenanceBlockRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new MaintenanceApi(config);

  const body = {
    // number
    blockId: 56,
    // number
    expectedVersion: 789,
    // string
    idempotencyKey: idempotencyKey_example,
  } satisfies CancelMaintenanceBlockRequest;

  try {
    const data = await api.cancelMaintenanceBlock(body);
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
| **expectedVersion** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |

### Return type

[**MaintenanceBlock**](MaintenanceBlock.md)

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


## createMaintenanceBlock

> MaintenanceBlock createMaintenanceBlock(roomId, startDate, endDate, idempotencyKey, reason)

Block a room only if no active inventory overlaps

### Example

```ts
import {
  Configuration,
  MaintenanceApi,
} from '';
import type { CreateMaintenanceBlockRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new MaintenanceApi(config);

  const body = {
    // number
    roomId: 56,
    // string
    startDate: startDate_example,
    // string
    endDate: endDate_example,
    // string
    idempotencyKey: idempotencyKey_example,
    // string (optional)
    reason: reason_example,
  } satisfies CreateMaintenanceBlockRequest;

  try {
    const data = await api.createMaintenanceBlock(body);
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
| **startDate** | `string` |  | [Defaults to `undefined`] |
| **endDate** | `string` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **reason** | `string` |  | [Optional] [Defaults to `&#39;Maintenance&#39;`] |

### Return type

[**MaintenanceBlock**](MaintenanceBlock.md)

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

