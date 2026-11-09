# RatesApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**previewRoomRates**](RatesApi.md#previewroomrates) | **POST** /apartments/{apartmentId}/rates/preview | Explain the accommodation price without reserving inventory or accepting a quote |
| [**roomRates**](RatesApi.md#roomrates) | **GET** /apartments/{apartmentId}/rates | Read configured EUR rates or an explicit unconfigured state |
| [**updateRoomRates**](RatesApi.md#updateroomrates) | **PUT** /apartments/{apartmentId}/rates | Replace a reviewed room\&#39;s base and non-overlapping seasonal rates |



<a id="previewroomrates"></a>
## previewRoomRates

> StayPrice previewRoomRates(apartmentId, ratePreviewRequest)

Explain the accommodation price without reserving inventory or accepting a quote

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **apartmentId** | `number` |  | [Defaults to `undefined`] |
| **ratePreviewRequest** | [RatePreviewRequest](RatePreviewRequest.md) |  | |

### Return type

[**StayPrice**](StayPrice.md)

### Authorization

[staffSession](../README.md#staffSession), [businessSelection](../README.md#businessSelection)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


<a id="roomrates"></a>
## roomRates

> RoomRates roomRates(apartmentId)

Read configured EUR rates or an explicit unconfigured state

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **apartmentId** | `number` |  | [Defaults to `undefined`] |

### Return type

[**RoomRates**](RoomRates.md)

### Authorization

[staffSession](../README.md#staffSession), [businessSelection](../README.md#businessSelection)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


<a id="updateroomrates"></a>
## updateRoomRates

> RoomRates updateRoomRates(apartmentId, rateUpdateRequest)

Replace a reviewed room\&#39;s base and non-overlapping seasonal rates

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **apartmentId** | `number` |  | [Defaults to `undefined`] |
| **rateUpdateRequest** | [RateUpdateRequest](RateUpdateRequest.md) |  | |

### Return type

[**RoomRates**](RoomRates.md)

### Authorization

[staffSession](../README.md#staffSession), [businessSelection](../README.md#businessSelection)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

