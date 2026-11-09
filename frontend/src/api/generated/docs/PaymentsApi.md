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



<a id="recordpayment"></a>
## recordPayment

> OperationResult recordPayment(id, idempotencyKey, paymentRequest)

Record a payment already completed outside Villas

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **id** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **paymentRequest** | [PaymentRequest](PaymentRequest.md) |  | |

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


<a id="recordrefund"></a>
## recordRefund

> OperationResult recordRefund(id, idempotencyKey, refundRequest)

Record an externally completed refund against one receipt

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **id** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **refundRequest** | [RefundRequest](RefundRequest.md) |  | |

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


<a id="refundablepayments"></a>
## refundablePayments

> RefundablePayments refundablePayments(id, beforeId, limit)

Read receipt allocations available for manual refund

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **id** | `number` |  | [Defaults to `undefined`] |
| **beforeId** | `string` |  | [Optional] [Defaults to `&#39;0&#39;`] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |

### Return type

[**RefundablePayments**](RefundablePayments.md)

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


<a id="reservationledger"></a>
## reservationLedger

> LedgerSummary reservationLedger(id)

Read agreed accommodation and externally received funds

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **id** | `number` |  | [Defaults to `undefined`] |

### Return type

[**LedgerSummary**](LedgerSummary.md)

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


<a id="reservationledgerhistory"></a>
## reservationLedgerHistory

> LedgerHistory reservationLedgerHistory(id, beforeId, limit)

Read immutable payment, refund and correction history

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **id** | `number` |  | [Defaults to `undefined`] |
| **beforeId** | `string` |  | [Optional] [Defaults to `&#39;0&#39;`] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |

### Return type

[**LedgerHistory**](LedgerHistory.md)

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


<a id="reverseledgerentry"></a>
## reverseLedgerEntry

> OperationResult reverseLedgerEntry(id, entryId, idempotencyKey, reversalRequest)

Retain and correct a mistaken payment or refund with a reason

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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

