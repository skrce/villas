# CustomerApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createCustomer**](CustomerApi.md#createcustomer) | **POST** /customers | Create a guest using a private JSON body |
| [**getCustomer**](CustomerApi.md#getcustomer) | **GET** /customers/{customerId} | Read a property-scoped guest |
| [**searchCustomer**](CustomerApi.md#searchcustomer) | **POST** /customers/search | Search guests without putting contact criteria in a URL |



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

