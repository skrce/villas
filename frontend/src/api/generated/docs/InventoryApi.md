# InventoryApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**listMaintenanceBlocks**](InventoryApi.md#listmaintenanceblocks) | **GET** /maintenance-blocks | Read a bounded maintenance calendar page |
| [**listReservations**](InventoryApi.md#listreservations) | **GET** /reservations | Read a bounded overlapping-stay calendar page |
| [**maintenanceHistory**](InventoryApi.md#maintenancehistory) | **GET** /maintenance-blocks/{blockId}/events | Read a bounded maintenance event page |
| [**reservationHistory**](InventoryApi.md#reservationhistory) | **GET** /reservations/{reservationId}/events | Read a bounded reservation event page |



<a id="listmaintenanceblocks"></a>
## listMaintenanceBlocks

> MaintenancePage listMaintenanceBlocks(startDate, endDate, status, afterId, limit, roomId)

Read a bounded maintenance calendar page

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **startDate** | `string` |  | [Defaults to `undefined`] |
| **endDate** | `string` |  | [Defaults to `undefined`] |
| **status** | `ACTIVE`, `CANCELLED` |  | [Optional] [Defaults to `undefined`] [Enum: ACTIVE, CANCELLED] |
| **afterId** | `number` |  | [Optional] [Defaults to `0`] |
| **limit** | `number` |  | [Optional] [Defaults to `100`] |
| **roomId** | `number` |  | [Optional] [Defaults to `undefined`] |

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


<a id="listreservations"></a>
## listReservations

> ReservationPage listReservations(startDate, endDate, status, afterId, limit, roomId)

Read a bounded overlapping-stay calendar page

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **startDate** | `string` |  | [Defaults to `undefined`] |
| **endDate** | `string` |  | [Defaults to `undefined`] |
| **status** | `ACTIVE`, `CANCELLED` |  | [Optional] [Defaults to `undefined`] [Enum: ACTIVE, CANCELLED] |
| **afterId** | `number` |  | [Optional] [Defaults to `0`] |
| **limit** | `number` |  | [Optional] [Defaults to `100`] |
| **roomId** | `number` |  | [Optional] [Defaults to `undefined`] |

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


<a id="maintenancehistory"></a>
## maintenanceHistory

> InventoryEventPage maintenanceHistory(blockId, afterId, limit)

Read a bounded maintenance event page

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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


<a id="reservationhistory"></a>
## reservationHistory

> InventoryEventPage reservationHistory(reservationId, afterId, limit)

Read a bounded reservation event page

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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

