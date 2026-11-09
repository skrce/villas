# MaintenanceApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**cancelMaintenanceBlock**](MaintenanceApi.md#cancelmaintenanceblock) | **DELETE** /maintenance-blocks/{blockId} | Retain a block cancellation and release inventory |
| [**createMaintenanceBlock**](MaintenanceApi.md#createmaintenanceblock) | **POST** /maintenance-blocks | Block a room only if no active inventory overlaps |



<a id="cancelmaintenanceblock"></a>
## cancelMaintenanceBlock

> MaintenanceInfo cancelMaintenanceBlock(blockId, expectedVersion, idempotencyKey)

Retain a block cancellation and release inventory

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **blockId** | `number` |  | [Defaults to `undefined`] |
| **expectedVersion** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |

### Return type

[**MaintenanceInfo**](MaintenanceInfo.md)

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


<a id="createmaintenanceblock"></a>
## createMaintenanceBlock

> MaintenanceInfo createMaintenanceBlock(roomId, startDate, endDate, idempotencyKey, reason)

Block a room only if no active inventory overlaps

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **roomId** | `number` |  | [Defaults to `undefined`] |
| **startDate** | `string` |  | [Defaults to `undefined`] |
| **endDate** | `string` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **reason** | `string` |  | [Optional] [Defaults to `&#39;Maintenance&#39;`] |

### Return type

[**MaintenanceInfo**](MaintenanceInfo.md)

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

