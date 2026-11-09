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



<a id="cancelstay"></a>
## cancelStay

> OperationResult cancelStay(id, idempotencyKey, stayReasonRequest)

Record a reasoned cancellation without an automatic refund

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **id** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **stayReasonRequest** | [StayReasonRequest](StayReasonRequest.md) |  | |

### Return type

[**OperationResult**](OperationResult.md)

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


<a id="changeroomreadiness"></a>
## changeRoomReadiness

> OperationResult changeRoomReadiness(roomId, idempotencyKey, readinessChangeRequest)

Record a reviewed room-readiness transition

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **roomId** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **readinessChangeRequest** | [ReadinessChangeRequest](ReadinessChangeRequest.md) |  | |

### Return type

[**OperationResult**](OperationResult.md)

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


<a id="changestay"></a>
## changeStay

> OperationResult changeStay(id, idempotencyKey, operationalChangeRequest)

Accept a new whole-stay quote and change reviewed dates or party size

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **id** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **operationalChangeRequest** | [OperationalChangeRequest](OperationalChangeRequest.md) |  | |

### Return type

[**OperationResult**](OperationResult.md)

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


<a id="checkinstay"></a>
## checkInStay

> OperationResult checkInStay(id, idempotencyKey, checkInRequest)

Record arrival within the booked dates into a reviewed clean room

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **id** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **checkInRequest** | [CheckInRequest](CheckInRequest.md) |  | |

### Return type

[**OperationResult**](OperationResult.md)

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


<a id="checkoutstay"></a>
## checkOutStay

> OperationResult checkOutStay(id, idempotencyKey, checkOutRequest)

Record departure and mark its room dirty in one transaction

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **id** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **checkOutRequest** | [CheckOutRequest](CheckOutRequest.md) |  | |

### Return type

[**OperationResult**](OperationResult.md)

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


<a id="correctstaytimes"></a>
## correctStayTimes

> OperationResult correctStayTimes(id, idempotencyKey, actualTimesRequest)

Correct actual arrival/departure times with a retained Owner reason

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **id** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **actualTimesRequest** | [ActualTimesRequest](ActualTimesRequest.md) |  | |

### Return type

[**OperationResult**](OperationResult.md)

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


<a id="frontdesk"></a>
## frontDesk

> FrontDeskPage frontDesk(list, afterId, limit, expectedDate)

Read bounded arrival, departure, in-house and attention lists for the property day

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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


<a id="housekeeping"></a>
## housekeeping

> HousekeepingPage housekeeping(afterId, limit, state, expectedDate)

Read room readiness, physical occupancy and dated maintenance without guest or financial data

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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


<a id="movestay"></a>
## moveStay

> OperationResult moveStay(id, idempotencyKey, operationalMoveRequest)

Accept a new whole-stay quote and move a confirmed or in-house stay

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **id** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **operationalMoveRequest** | [OperationalMoveRequest](OperationalMoveRequest.md) |  | |

### Return type

[**OperationResult**](OperationResult.md)

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


<a id="propertytimeoptions"></a>
## propertyTimeOptions

> PropertyTimeOptions propertyTimeOptions(propertyTimeRequest)

Resolve a Skopje time to explicit UTC choices, including repeated or missing daylight-saving times

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **propertyTimeRequest** | [PropertyTimeRequest](PropertyTimeRequest.md) |  | |

### Return type

[**PropertyTimeOptions**](PropertyTimeOptions.md)

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


<a id="recordnoshow"></a>
## recordNoShow

> OperationResult recordNoShow(id, idempotencyKey, stayReasonRequest)

Record a reasoned no-show after the arrival day

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **id** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **stayReasonRequest** | [StayReasonRequest](StayReasonRequest.md) |  | |

### Return type

[**OperationResult**](OperationResult.md)

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


<a id="reservationallocations"></a>
## reservationAllocations

> RoomAllocationPage reservationAllocations(id, afterId, limit, expectedVersion)

Read versioned dated room allocations without changing the whole-stay price

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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


<a id="roomreadiness"></a>
## roomReadiness

> ReadinessView roomReadiness(roomId)

Read current room readiness without guest or financial data

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **roomId** | `number` |  | [Defaults to `undefined`] |

### Return type

[**ReadinessView**](ReadinessView.md)

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


<a id="roomreadinesshistory"></a>
## roomReadinessHistory

> ReadinessHistory roomReadinessHistory(roomId, afterId, limit)

Read bounded room-readiness history

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **roomId** | `number` |  | [Defaults to `undefined`] |
| **afterId** | `string` |  | [Optional] [Defaults to `&#39;0&#39;`] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |

### Return type

[**ReadinessHistory**](ReadinessHistory.md)

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

