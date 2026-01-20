# ApartmentApi

All URIs are relative to *http://localhost:9098*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**listApartments**](ApartmentApi.md#listapartments) | **GET** /apartment | List all apartments |



## listApartments

> Array&lt;Apartment&gt; listApartments()

List all apartments

### Example

```ts
import {
  Configuration,
  ApartmentApi,
} from '';
import type { ListApartmentsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure HTTP basic authorization: basicAuth
    username: "YOUR USERNAME",
    password: "YOUR PASSWORD",
  });
  const api = new ApartmentApi(config);

  try {
    const data = await api.listApartments();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**Array&lt;Apartment&gt;**](Apartment.md)

### Authorization

[basicAuth](../README.md#basicAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | A list of apartments |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

