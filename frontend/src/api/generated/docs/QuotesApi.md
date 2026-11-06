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



## changeReservationWithQuote

> ReservationInfo changeReservationWithQuote(reservationId, idempotencyKey, quotedStayChange)

Accept a new whole-stay price and change dates or party size atomically

### Example

```ts
import {
  Configuration,
  QuotesApi,
} from '';
import type { ChangeReservationWithQuoteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new QuotesApi(config);

  const body = {
    // number
    reservationId: 56,
    // string
    idempotencyKey: idempotencyKey_example,
    // QuotedStayChange
    quotedStayChange: ...,
  } satisfies ChangeReservationWithQuoteRequest;

  try {
    const data = await api.changeReservationWithQuote(body);
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


## confirmReservationQuote

> number confirmReservationQuote(idempotencyKey, quoteConfirmationRequest)

Accept a saved quote and atomically create its priced reservation with a stable operation key

### Example

```ts
import {
  Configuration,
  QuotesApi,
} from '';
import type { ConfirmReservationQuoteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new QuotesApi(config);

  const body = {
    // string
    idempotencyKey: idempotencyKey_example,
    // QuoteConfirmationRequest
    quoteConfirmationRequest: ...,
  } satisfies ConfirmReservationQuoteRequest;

  try {
    const data = await api.confirmReservationQuote(body);
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


## createBookingQuote

> BookingQuote createBookingQuote(quoteRequest)

Save an Owner-scoped EUR accommodation quote without holding inventory

### Example

```ts
import {
  Configuration,
  QuotesApi,
} from '';
import type { CreateBookingQuoteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new QuotesApi(config);

  const body = {
    // QuoteRequest
    quoteRequest: ...,
  } satisfies CreateBookingQuoteRequest;

  try {
    const data = await api.createBookingQuote(body);
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


## getBookingQuote

> BookingQuote getBookingQuote(quoteId)

Read this Owner\&#39;s saved historical quote

### Example

```ts
import {
  Configuration,
  QuotesApi,
} from '';
import type { GetBookingQuoteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new QuotesApi(config);

  const body = {
    // string
    quoteId: quoteId_example,
  } satisfies GetBookingQuoteRequest;

  try {
    const data = await api.getBookingQuote(body);
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


## moveReservationWithQuote

> ReservationInfo moveReservationWithQuote(reservationId, idempotencyKey, quotedRoomChange)

Accept a new whole-stay price and move the reservation atomically

### Example

```ts
import {
  Configuration,
  QuotesApi,
} from '';
import type { MoveReservationWithQuoteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new QuotesApi(config);

  const body = {
    // number
    reservationId: 56,
    // string
    idempotencyKey: idempotencyKey_example,
    // QuotedRoomChange
    quotedRoomChange: ...,
  } satisfies MoveReservationWithQuoteRequest;

  try {
    const data = await api.moveReservationWithQuote(body);
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


## reservationPrice

> ReservationPriceView reservationPrice(reservationId)

Read the accepted price or explicit unrecorded historical state

### Example

```ts
import {
  Configuration,
  QuotesApi,
} from '';
import type { ReservationPriceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new QuotesApi(config);

  const body = {
    // number
    reservationId: 56,
  } satisfies ReservationPriceRequest;

  try {
    const data = await api.reservationPrice(body);
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


## reservationPriceHistory

> PriceHistory reservationPriceHistory(reservationId, beforeVersion, limit)

Read bounded immutable accepted price history

### Example

```ts
import {
  Configuration,
  QuotesApi,
} from '';
import type { ReservationPriceHistoryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new QuotesApi(config);

  const body = {
    // number
    reservationId: 56,
    // number (optional)
    beforeVersion: 789,
    // number (optional)
    limit: 56,
  } satisfies ReservationPriceHistoryRequest;

  try {
    const data = await api.reservationPriceHistory(body);
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

