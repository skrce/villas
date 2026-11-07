# PaymentsApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**recordPayment**](PaymentsApi.md#recordpayment) | **POST** /reservations/{id}/ledger/payments | Record a payment already completed outside Villas |
| [**recordRefund**](PaymentsApi.md#recordrefund) | **POST** /reservations/{id}/ledger/refunds | Record an externally completed refund against one receipt |
| [**refundablePayments**](PaymentsApi.md#refundablepayments) | **GET** /reservations/{id}/ledger/payments | Read receipt allocations available for manual refund |
| [**reservationLedger**](PaymentsApi.md#reservationledger) | **GET** /reservations/{id}/ledger | Read agreed accommodation and externally received funds |
| [**reservationLedgerHistory**](PaymentsApi.md#reservationledgerhistory) | **GET** /reservations/{id}/ledger/entries | Read immutable payment, refund and correction history |
| [**reverseLedgerEntry**](PaymentsApi.md#reverseledgerentry) | **POST** /reservations/{id}/ledger/entries/{entryId}/reversal | Retain and correct a mistaken payment or refund with a reason |



## recordPayment

> OperationResult recordPayment(id, idempotencyKey, paymentRequest)

Record a payment already completed outside Villas

### Example

```ts
import {
  Configuration,
  PaymentsApi,
} from '';
import type { RecordPaymentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new PaymentsApi(config);

  const body = {
    // number
    id: 56,
    // string
    idempotencyKey: idempotencyKey_example,
    // PaymentRequest
    paymentRequest: ...,
  } satisfies RecordPaymentRequest;

  try {
    const data = await api.recordPayment(body);
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
| **id** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **paymentRequest** | [PaymentRequest](PaymentRequest.md) |  | |

### Return type

[**OperationResult**](OperationResult.md)

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


## recordRefund

> OperationResult recordRefund(id, idempotencyKey, refundRequest)

Record an externally completed refund against one receipt

### Example

```ts
import {
  Configuration,
  PaymentsApi,
} from '';
import type { RecordRefundRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new PaymentsApi(config);

  const body = {
    // number
    id: 56,
    // string
    idempotencyKey: idempotencyKey_example,
    // RefundRequest
    refundRequest: ...,
  } satisfies RecordRefundRequest;

  try {
    const data = await api.recordRefund(body);
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
| **id** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **refundRequest** | [RefundRequest](RefundRequest.md) |  | |

### Return type

[**OperationResult**](OperationResult.md)

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


## refundablePayments

> RefundablePayments refundablePayments(id, beforeId, limit)

Read receipt allocations available for manual refund

### Example

```ts
import {
  Configuration,
  PaymentsApi,
} from '';
import type { RefundablePaymentsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new PaymentsApi(config);

  const body = {
    // number
    id: 56,
    // string (optional)
    beforeId: beforeId_example,
    // number (optional)
    limit: 56,
  } satisfies RefundablePaymentsRequest;

  try {
    const data = await api.refundablePayments(body);
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
| **id** | `number` |  | [Defaults to `undefined`] |
| **beforeId** | `string` |  | [Optional] [Defaults to `&#39;0&#39;`] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |

### Return type

[**RefundablePayments**](RefundablePayments.md)

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


## reservationLedger

> LedgerSummary reservationLedger(id)

Read agreed accommodation and externally received funds

### Example

```ts
import {
  Configuration,
  PaymentsApi,
} from '';
import type { ReservationLedgerRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new PaymentsApi(config);

  const body = {
    // number
    id: 56,
  } satisfies ReservationLedgerRequest;

  try {
    const data = await api.reservationLedger(body);
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
| **id** | `number` |  | [Defaults to `undefined`] |

### Return type

[**LedgerSummary**](LedgerSummary.md)

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


## reservationLedgerHistory

> LedgerHistory reservationLedgerHistory(id, beforeId, limit)

Read immutable payment, refund and correction history

### Example

```ts
import {
  Configuration,
  PaymentsApi,
} from '';
import type { ReservationLedgerHistoryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new PaymentsApi(config);

  const body = {
    // number
    id: 56,
    // string (optional)
    beforeId: beforeId_example,
    // number (optional)
    limit: 56,
  } satisfies ReservationLedgerHistoryRequest;

  try {
    const data = await api.reservationLedgerHistory(body);
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
| **id** | `number` |  | [Defaults to `undefined`] |
| **beforeId** | `string` |  | [Optional] [Defaults to `&#39;0&#39;`] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |

### Return type

[**LedgerHistory**](LedgerHistory.md)

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


## reverseLedgerEntry

> OperationResult reverseLedgerEntry(id, entryId, idempotencyKey, reversalRequest)

Retain and correct a mistaken payment or refund with a reason

### Example

```ts
import {
  Configuration,
  PaymentsApi,
} from '';
import type { ReverseLedgerEntryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new PaymentsApi(config);

  const body = {
    // number
    id: 56,
    // string
    entryId: entryId_example,
    // string
    idempotencyKey: idempotencyKey_example,
    // ReversalRequest
    reversalRequest: ...,
  } satisfies ReverseLedgerEntryRequest;

  try {
    const data = await api.reverseLedgerEntry(body);
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
| **id** | `number` |  | [Defaults to `undefined`] |
| **entryId** | `string` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **reversalRequest** | [ReversalRequest](ReversalRequest.md) |  | |

### Return type

[**OperationResult**](OperationResult.md)

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

