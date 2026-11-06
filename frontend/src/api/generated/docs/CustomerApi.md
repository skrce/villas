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



## createCustomer

> number createCustomer(customerCreateRequest)

Create a guest using a private JSON body

### Example

```ts
import {
  Configuration,
  CustomerApi,
} from '';
import type { CreateCustomerRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new CustomerApi(config);

  const body = {
    // CustomerCreateRequest
    customerCreateRequest: ...,
  } satisfies CreateCustomerRequest;

  try {
    const data = await api.createCustomer(body);
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


## customerDuplicates

> Array&lt;Customer&gt; customerDuplicates(customerCreateRequest)

Review possible guest matches without merging identities

### Example

```ts
import {
  Configuration,
  CustomerApi,
} from '';
import type { CustomerDuplicatesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new CustomerApi(config);

  const body = {
    // CustomerCreateRequest
    customerCreateRequest: ...,
  } satisfies CustomerDuplicatesRequest;

  try {
    const data = await api.customerDuplicates(body);
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


## customerReservations

> ReservationPage customerReservations(customerId, afterId, limit, status)

Read a bounded guest history including retained cancellations

### Example

```ts
import {
  Configuration,
  CustomerApi,
} from '';
import type { CustomerReservationsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new CustomerApi(config);

  const body = {
    // number
    customerId: 56,
    // number (optional)
    afterId: 56,
    // number (optional)
    limit: 56,
    // 'ACTIVE' | 'CANCELLED' (optional)
    status: status_example,
  } satisfies CustomerReservationsRequest;

  try {
    const data = await api.customerReservations(body);
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


## getCustomer

> Customer getCustomer(customerId)

Read a property-scoped guest

### Example

```ts
import {
  Configuration,
  CustomerApi,
} from '';
import type { GetCustomerRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new CustomerApi(config);

  const body = {
    // number
    customerId: 56,
  } satisfies GetCustomerRequest;

  try {
    const data = await api.getCustomer(body);
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


## queryCustomers

> GuestPage queryCustomers(guestQueryRequest)

List or search guests with private combined criteria and a bounded cursor

### Example

```ts
import {
  Configuration,
  CustomerApi,
} from '';
import type { QueryCustomersRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new CustomerApi(config);

  const body = {
    // GuestQueryRequest
    guestQueryRequest: ...,
  } satisfies QueryCustomersRequest;

  try {
    const data = await api.queryCustomers(body);
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


## searchCustomer

> Array&lt;Customer&gt; searchCustomer(customerSearchRequest)

Search guests without putting contact criteria in a URL

### Example

```ts
import {
  Configuration,
  CustomerApi,
} from '';
import type { SearchCustomerRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new CustomerApi(config);

  const body = {
    // CustomerSearchRequest
    customerSearchRequest: ...,
  } satisfies SearchCustomerRequest;

  try {
    const data = await api.searchCustomer(body);
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


## setCustomerStatus

> Customer setCustomerStatus(customerId, recordStatusRequest)

Archive or restore a guest without deleting history

### Example

```ts
import {
  Configuration,
  CustomerApi,
} from '';
import type { SetCustomerStatusRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new CustomerApi(config);

  const body = {
    // number
    customerId: 56,
    // RecordStatusRequest
    recordStatusRequest: ...,
  } satisfies SetCustomerStatusRequest;

  try {
    const data = await api.setCustomerStatus(body);
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


## updateCustomer

> Customer updateCustomer(customerId, guestUpdateRequest)

Replace a guest profile using the reviewed version

### Example

```ts
import {
  Configuration,
  CustomerApi,
} from '';
import type { UpdateCustomerRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new CustomerApi(config);

  const body = {
    // number
    customerId: 56,
    // GuestUpdateRequest
    guestUpdateRequest: ...,
  } satisfies UpdateCustomerRequest;

  try {
    const data = await api.updateCustomer(body);
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

