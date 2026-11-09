# QuotesApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**changeReservationWithQuote**](QuotesApi.md#changereservationwithquote) | **PATCH** /reservations/{reservationId}/dates/quoted | Accept a new whole-stay price and change dates or party size atomically |
| [**confirmReservationQuote**](QuotesApi.md#confirmreservationquote) | **POST** /reservations/quoted | Accept a saved quote and atomically create its priced reservation with a stable operation key |
| [**createBookingQuote**](QuotesApi.md#createbookingquote) | **POST** /booking-quotes | Save an Owner-scoped EUR accommodation quote without holding inventory |
| [**getBookingQuote**](QuotesApi.md#getbookingquote) | **GET** /booking-quotes/{quoteId} | Read this Owner\&#39;s saved historical quote |
| [**moveReservationWithQuote**](QuotesApi.md#movereservationwithquote) | **PATCH** /reservations/{reservationId}/room/quoted | Accept a new whole-stay price and move the reservation atomically |
| [**reservationPrice**](QuotesApi.md#reservationprice) | **GET** /reservations/{reservationId}/price | Read the accepted price or explicit unrecorded historical state |
| [**reservationPriceHistory**](QuotesApi.md#reservationpricehistory) | **GET** /reservations/{reservationId}/prices | Read bounded immutable accepted price history |



<a id="changereservationwithquote"></a>
## changeReservationWithQuote

> ReservationInfo changeReservationWithQuote(reservationId, idempotencyKey, quotedStayChange)

Accept a new whole-stay price and change dates or party size atomically

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **reservationId** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **quotedStayChange** | [QuotedStayChange](QuotedStayChange.md) |  | |

### Return type

[**ReservationInfo**](ReservationInfo.md)

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


<a id="confirmreservationquote"></a>
## confirmReservationQuote

> number confirmReservationQuote(idempotencyKey, quoteConfirmationRequest)

Accept a saved quote and atomically create its priced reservation with a stable operation key

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **quoteConfirmationRequest** | [QuoteConfirmationRequest](QuoteConfirmationRequest.md) |  | |

### Return type

**number**

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


<a id="createbookingquote"></a>
## createBookingQuote

> BookingQuote createBookingQuote(quoteRequest)

Save an Owner-scoped EUR accommodation quote without holding inventory

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **quoteRequest** | [QuoteRequest](QuoteRequest.md) |  | |

### Return type

[**BookingQuote**](BookingQuote.md)

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


<a id="getbookingquote"></a>
## getBookingQuote

> BookingQuote getBookingQuote(quoteId)

Read this Owner\&#39;s saved historical quote

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **quoteId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**BookingQuote**](BookingQuote.md)

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


<a id="movereservationwithquote"></a>
## moveReservationWithQuote

> ReservationInfo moveReservationWithQuote(reservationId, idempotencyKey, quotedRoomChange)

Accept a new whole-stay price and move the reservation atomically

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **reservationId** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **quotedRoomChange** | [QuotedRoomChange](QuotedRoomChange.md) |  | |

### Return type

[**ReservationInfo**](ReservationInfo.md)

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


<a id="reservationprice"></a>
## reservationPrice

> ReservationPriceView reservationPrice(reservationId)

Read the accepted price or explicit unrecorded historical state

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **reservationId** | `number` |  | [Defaults to `undefined`] |

### Return type

[**ReservationPriceView**](ReservationPriceView.md)

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


<a id="reservationpricehistory"></a>
## reservationPriceHistory

> PriceHistory reservationPriceHistory(reservationId, beforeVersion, limit)

Read bounded immutable accepted price history

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **reservationId** | `number` |  | [Defaults to `undefined`] |
| **beforeVersion** | `number` |  | [Optional] [Defaults to `undefined`] |
| **limit** | `number` |  | [Optional] [Defaults to `20`] |

### Return type

[**PriceHistory**](PriceHistory.md)

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

