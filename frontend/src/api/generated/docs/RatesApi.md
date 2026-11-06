# RatesApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**previewRoomRates**](RatesApi.md#previewroomrates) | **POST** /apartments/{apartmentId}/rates/preview | Explain the accommodation price without reserving inventory or accepting a quote |
| [**roomRates**](RatesApi.md#roomrates) | **GET** /apartments/{apartmentId}/rates | Read configured EUR rates or an explicit unconfigured state |
| [**updateRoomRates**](RatesApi.md#updateroomrates) | **PUT** /apartments/{apartmentId}/rates | Replace a reviewed room\&#39;s base and non-overlapping seasonal rates |



## previewRoomRates

> StayPrice previewRoomRates(apartmentId, ratePreviewRequest)

Explain the accommodation price without reserving inventory or accepting a quote

### Example

```ts
import {
  Configuration,
  RatesApi,
} from '';
import type { PreviewRoomRatesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new RatesApi(config);

  const body = {
    // number
    apartmentId: 56,
    // RatePreviewRequest
    ratePreviewRequest: ...,
  } satisfies PreviewRoomRatesRequest;

  try {
    const data = await api.previewRoomRates(body);
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
| **apartmentId** | `number` |  | [Defaults to `undefined`] |
| **ratePreviewRequest** | [RatePreviewRequest](RatePreviewRequest.md) |  | |

### Return type

[**StayPrice**](StayPrice.md)

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


## roomRates

> RoomRates roomRates(apartmentId)

Read configured EUR rates or an explicit unconfigured state

### Example

```ts
import {
  Configuration,
  RatesApi,
} from '';
import type { RoomRatesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new RatesApi(config);

  const body = {
    // number
    apartmentId: 56,
  } satisfies RoomRatesRequest;

  try {
    const data = await api.roomRates(body);
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
| **apartmentId** | `number` |  | [Defaults to `undefined`] |

### Return type

[**RoomRates**](RoomRates.md)

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


## updateRoomRates

> RoomRates updateRoomRates(apartmentId, rateUpdateRequest)

Replace a reviewed room\&#39;s base and non-overlapping seasonal rates

### Example

```ts
import {
  Configuration,
  RatesApi,
} from '';
import type { UpdateRoomRatesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new RatesApi(config);

  const body = {
    // number
    apartmentId: 56,
    // RateUpdateRequest
    rateUpdateRequest: ...,
  } satisfies UpdateRoomRatesRequest;

  try {
    const data = await api.updateRoomRates(body);
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
| **apartmentId** | `number` |  | [Defaults to `undefined`] |
| **rateUpdateRequest** | [RateUpdateRequest](RateUpdateRequest.md) |  | |

### Return type

[**RoomRates**](RoomRates.md)

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

