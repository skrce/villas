# CustomerApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createCustomer**](CustomerApi.md#createcustomer) | **POST** /customers | Creates a customer. |
| [**searchCustomer**](CustomerApi.md#searchcustomer) | **GET** /customers | Search customer by part of firstName or phone. |



## createCustomer

> number createCustomer(firstName, lastName, phone, address)

Creates a customer.

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
    // string | First name
    firstName: firstName_example,
    // string | Last name
    lastName: lastName_example,
    // string | Phone number
    phone: phone_example,
    // string | Address (Country, City, Street, Number)
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
| **firstName** | `string` | First name | [Defaults to `undefined`] |
| **lastName** | `string` | Last name | [Defaults to `undefined`] |
| **phone** | `string` | Phone number | [Defaults to `undefined`] |
| **address** | `string` | Address (Country, City, Street, Number) | [Defaults to `undefined`] |

### Return type

**number**

### Authorization

[basicAuth](../README.md#basicAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`, `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## searchCustomer

> Array&lt;Customer&gt; searchCustomer(firstName, phone)

Search customer by part of firstName or phone.

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
    // string | First name (optional)
    firstName: firstName_example,
    // string | Phone number (optional)
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
| **firstName** | `string` | First name | [Optional] [Defaults to `undefined`] |
| **phone** | `string` | Phone number | [Optional] [Defaults to `undefined`] |

### Return type

[**Array&lt;Customer&gt;**](Customer.md)

### Authorization

[basicAuth](../README.md#basicAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`, `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

