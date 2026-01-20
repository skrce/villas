# CustomerApi

All URIs are relative to *http://localhost:9098*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createCustomer**](CustomerApi.md#createcustomer) | **POST** /customer | Create a customer |
| [**searchCustomer**](CustomerApi.md#searchcustomer) | **GET** /customer | Search customers by first name or phone |



## createCustomer

> number createCustomer(firstName, lastName, phone, address)

Create a customer

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
    // To configure HTTP basic authorization: basicAuth
    username: "YOUR USERNAME",
    password: "YOUR PASSWORD",
  });
  const api = new CustomerApi(config);

  const body = {
    // string
    firstName: firstName_example,
    // string
    lastName: lastName_example,
    // string
    phone: phone_example,
    // string
    address: address_example,
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
| **firstName** | `string` |  | [Defaults to `undefined`] |
| **lastName** | `string` |  | [Defaults to `undefined`] |
| **phone** | `string` |  | [Defaults to `undefined`] |
| **address** | `string` |  | [Defaults to `undefined`] |

### Return type

**number**

### Authorization

[basicAuth](../README.md#basicAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The new customer ID |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## searchCustomer

> Array&lt;Customer&gt; searchCustomer(firstName, phone)

Search customers by first name or phone

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
    // To configure HTTP basic authorization: basicAuth
    username: "YOUR USERNAME",
    password: "YOUR PASSWORD",
  });
  const api = new CustomerApi(config);

  const body = {
    // string (optional)
    firstName: firstName_example,
    // string (optional)
    phone: phone_example,
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
| **firstName** | `string` |  | [Optional] [Defaults to `undefined`] |
| **phone** | `string` |  | [Optional] [Defaults to `undefined`] |

### Return type

[**Array&lt;Customer&gt;**](Customer.md)

### Authorization

[basicAuth](../README.md#basicAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Matching customers |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

