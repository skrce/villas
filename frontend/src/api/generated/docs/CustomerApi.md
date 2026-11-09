# CustomerApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createCustomer**](CustomerApi.md#createcustomer) | **POST** /customers | Create a guest using a private JSON body |
| [**customerDuplicates**](CustomerApi.md#customerduplicates) | **POST** /customers/duplicates | Review possible guest matches without merging identities |
| [**customerReservations**](CustomerApi.md#customerreservations) | **GET** /customers/{customerId}/reservations | Read a bounded guest history including retained cancellations |
| [**getCustomer**](CustomerApi.md#getcustomer) | **GET** /customers/{customerId} | Read a property-scoped guest |
| [**queryCustomers**](CustomerApi.md#querycustomers) | **POST** /customers/query | List or search guests with private combined criteria and a bounded cursor |
| [**searchCustomer**](CustomerApi.md#searchcustomer) | **POST** /customers/search | Search guests without putting contact criteria in a URL |
| [**setCustomerStatus**](CustomerApi.md#setcustomerstatus) | **POST** /customers/{customerId}/status | Archive or restore a guest without deleting history |
| [**updateCustomer**](CustomerApi.md#updatecustomer) | **PUT** /customers/{customerId} | Replace a guest profile using the reviewed version |



<a id="createcustomer"></a>
## createCustomer

> number createCustomer(customerCreateRequest)

Create a guest using a private JSON body

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **customerCreateRequest** | [CustomerCreateRequest](CustomerCreateRequest.md) |  | |

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


<a id="customerduplicates"></a>
## customerDuplicates

> Array&lt;Customer&gt; customerDuplicates(customerCreateRequest)

Review possible guest matches without merging identities

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **customerCreateRequest** | [CustomerCreateRequest](CustomerCreateRequest.md) |  | |

### Return type

[**Array&lt;Customer&gt;**](Customer.md)

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


<a id="customerreservations"></a>
## customerReservations

> ReservationPage customerReservations(customerId, afterId, limit, status)

Read a bounded guest history including retained cancellations

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **customerId** | `number` |  | [Defaults to `undefined`] |
| **afterId** | `number` |  | [Optional] [Defaults to `0`] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |
| **status** | `ACTIVE`, `CANCELLED` |  | [Optional] [Defaults to `undefined`] [Enum: ACTIVE, CANCELLED] |

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


<a id="getcustomer"></a>
## getCustomer

> Customer getCustomer(customerId)

Read a property-scoped guest

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **customerId** | `number` |  | [Defaults to `undefined`] |

### Return type

[**Customer**](Customer.md)

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


<a id="querycustomers"></a>
## queryCustomers

> GuestPage queryCustomers(guestQueryRequest)

List or search guests with private combined criteria and a bounded cursor

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **guestQueryRequest** | [GuestQueryRequest](GuestQueryRequest.md) |  | |

### Return type

[**GuestPage**](GuestPage.md)

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


<a id="searchcustomer"></a>
## searchCustomer

> Array&lt;Customer&gt; searchCustomer(customerSearchRequest)

Search guests without putting contact criteria in a URL

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **customerSearchRequest** | [CustomerSearchRequest](CustomerSearchRequest.md) |  | |

### Return type

[**Array&lt;Customer&gt;**](Customer.md)

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


<a id="setcustomerstatus"></a>
## setCustomerStatus

> Customer setCustomerStatus(customerId, recordStatusRequest)

Archive or restore a guest without deleting history

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **customerId** | `number` |  | [Defaults to `undefined`] |
| **recordStatusRequest** | [RecordStatusRequest](RecordStatusRequest.md) |  | |

### Return type

[**Customer**](Customer.md)

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


<a id="updatecustomer"></a>
## updateCustomer

> Customer updateCustomer(customerId, guestUpdateRequest)

Replace a guest profile using the reviewed version

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **customerId** | `number` |  | [Defaults to `undefined`] |
| **guestUpdateRequest** | [GuestUpdateRequest](GuestUpdateRequest.md) |  | |

### Return type

[**Customer**](Customer.md)

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

