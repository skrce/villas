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



<a id="cancelreservation"></a>
## cancelReservation

> cancelReservation(reservationId, expectedVersion, idempotencyKey)

Retain a cancellation and release inventory

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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


<a id="changereservationdates"></a>
## changeReservationDates

> ReservationInfo changeReservationDates(reservationId, startDate, endDate, guestCount, expectedVersion, idempotencyKey, quoteId)

Change stay dates and guest count

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **reservationId** | `number` |  | [Defaults to `undefined`] |
| **startDate** | `string` |  | [Defaults to `undefined`] |
| **endDate** | `string` |  | [Defaults to `undefined`] |
| **guestCount** | `number` |  | [Defaults to `undefined`] |
| **expectedVersion** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **quoteId** | `string` |  | [Optional] [Defaults to `undefined`] |

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


<a id="createreservation"></a>
## createReservation

> number createReservation(customerId, roomId, startDate, endDate, idempotencyKey, guestCount, quoteId)

Create a reservation with an accepted quote and stable operation key

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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


<a id="findavailableapartments"></a>
## findAvailableApartments

> Array&lt;Apartment&gt; findAvailableApartments(startDate, endDate, guestCount)

Read advisory availability using the write-side overlap rules

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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


<a id="findreservationsbycustomer"></a>
## findReservationsByCustomer

> Array&lt;ReservationInfo&gt; findReservationsByCustomer(customerId)

Read active reservations for a guest

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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


<a id="getoperation"></a>
## getOperation

> OperationResult getOperation(operationKey, kind)

Reconcile a write using its stable operation key

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **operationKey** | `string` |  | [Defaults to `undefined`] |
| **kind** | `CREATE`, `MOVE`, `CHANGE`, `CANCEL`, `BLOCK`, `UNBLOCK`, `CHECK_IN`, `CHECK_OUT`, `NO_SHOW`, `CORRECT_STAY`, `SET_READINESS`, `RECORD_PAYMENT`, `RECORD_REFUND`, `REVERSE_ENTRY` |  | [Defaults to `undefined`] [Enum: CREATE, MOVE, CHANGE, CANCEL, BLOCK, UNBLOCK, CHECK_IN, CHECK_OUT, NO_SHOW, CORRECT_STAY, SET_READINESS, RECORD_PAYMENT, RECORD_REFUND, REVERSE_ENTRY] |

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


<a id="getreservation"></a>
## getReservation

> ReservationInfo getReservation(reservationId)

Read the current reservation, including its version

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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


<a id="updatereservationroom"></a>
## updateReservationRoom

> updateReservationRoom(reservationId, newRoomId, expectedVersion, idempotencyKey, quoteId)

Move a reservation using its expected version

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **reservationId** | `number` |  | [Defaults to `undefined`] |
| **newRoomId** | `number` |  | [Defaults to `undefined`] |
| **expectedVersion** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **quoteId** | `string` |  | [Optional] [Defaults to `undefined`] |

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

