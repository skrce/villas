# ApartmentApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**apartmentDirectory**](ApartmentApi.md#apartmentdirectory) | **GET** /apartments/directory | Read a bounded room directory by name or reference |
| [**blockApartment**](ApartmentApi.md#blockapartment) | **POST** /apartments/{apartmentId}/maintenance | Add a dated maintenance block using a private JSON body |
| [**createApartment**](ApartmentApi.md#createapartment) | **POST** /apartments | Add a named room with a unique property reference |
| [**getApartment**](ApartmentApi.md#getapartment) | **GET** /apartments/{apartmentId} | Read a property-scoped current or archived room |
| [**listApartments**](ApartmentApi.md#listapartments) | **GET** /apartments | List rooms for compatibility and booking selectors |
| [**setApartmentStatus**](ApartmentApi.md#setapartmentstatus) | **POST** /apartments/{apartmentId}/status | Archive or restore a room while retaining its history |
| [**updateApartment**](ApartmentApi.md#updateapartment) | **PUT** /apartments/{apartmentId} | Edit a reviewed room without invalidating current or future stays |



## apartmentDirectory

> RoomPage apartmentDirectory(name, includeArchived, afterId, limit)

Read a bounded room directory by name or reference

### Example

```ts
import {
  Configuration,
  ApartmentApi,
} from '';
import type { ApartmentDirectoryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new ApartmentApi(config);

  const body = {
    // string (optional)
    name: name_example,
    // boolean (optional)
    includeArchived: true,
    // number (optional)
    afterId: 56,
    // number (optional)
    limit: 56,
  } satisfies ApartmentDirectoryRequest;

  try {
    const data = await api.apartmentDirectory(body);
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
| **name** | `string` |  | [Optional] [Defaults to `undefined`] |
| **includeArchived** | `boolean` |  | [Optional] [Defaults to `false`] |
| **afterId** | `number` |  | [Optional] [Defaults to `0`] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |

### Return type

[**RoomPage**](RoomPage.md)

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


## blockApartment

> MaintenanceBlock blockApartment(apartmentId, idempotencyKey, roomBlockRequest)

Add a dated maintenance block using a private JSON body

### Example

```ts
import {
  Configuration,
  ApartmentApi,
} from '';
import type { BlockApartmentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new ApartmentApi(config);

  const body = {
    // number
    apartmentId: 56,
    // string
    idempotencyKey: idempotencyKey_example,
    // RoomBlockRequest
    roomBlockRequest: ...,
  } satisfies BlockApartmentRequest;

  try {
    const data = await api.blockApartment(body);
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
| **apartmentId** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **roomBlockRequest** | [RoomBlockRequest](RoomBlockRequest.md) |  | |

### Return type

[**MaintenanceBlock**](MaintenanceBlock.md)

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


## createApartment

> Apartment createApartment(roomCreateRequest)

Add a named room with a unique property reference

### Example

```ts
import {
  Configuration,
  ApartmentApi,
} from '';
import type { CreateApartmentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new ApartmentApi(config);

  const body = {
    // RoomCreateRequest
    roomCreateRequest: ...,
  } satisfies CreateApartmentRequest;

  try {
    const data = await api.createApartment(body);
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
| **roomCreateRequest** | [RoomCreateRequest](RoomCreateRequest.md) |  | |

### Return type

[**Apartment**](Apartment.md)

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


## getApartment

> Apartment getApartment(apartmentId)

Read a property-scoped current or archived room

### Example

```ts
import {
  Configuration,
  ApartmentApi,
} from '';
import type { GetApartmentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new ApartmentApi(config);

  const body = {
    // number
    apartmentId: 56,
  } satisfies GetApartmentRequest;

  try {
    const data = await api.getApartment(body);
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
| **apartmentId** | `number` |  | [Defaults to `undefined`] |

### Return type

[**Apartment**](Apartment.md)

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


## listApartments

> Array&lt;Apartment&gt; listApartments()

List rooms for compatibility and booking selectors

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
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
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

[staffSession](../README.md#staffSession)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`, `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## setApartmentStatus

> Apartment setApartmentStatus(apartmentId, recordStatusRequest)

Archive or restore a room while retaining its history

### Example

```ts
import {
  Configuration,
  ApartmentApi,
} from '';
import type { SetApartmentStatusRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new ApartmentApi(config);

  const body = {
    // number
    apartmentId: 56,
    // RecordStatusRequest
    recordStatusRequest: ...,
  } satisfies SetApartmentStatusRequest;

  try {
    const data = await api.setApartmentStatus(body);
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
| **apartmentId** | `number` |  | [Defaults to `undefined`] |
| **recordStatusRequest** | [RecordStatusRequest](RecordStatusRequest.md) |  | |

### Return type

[**Apartment**](Apartment.md)

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


## updateApartment

> Apartment updateApartment(apartmentId, roomUpdateRequest)

Edit a reviewed room without invalidating current or future stays

### Example

```ts
import {
  Configuration,
  ApartmentApi,
} from '';
import type { UpdateApartmentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new ApartmentApi(config);

  const body = {
    // number
    apartmentId: 56,
    // RoomUpdateRequest
    roomUpdateRequest: ...,
  } satisfies UpdateApartmentRequest;

  try {
    const data = await api.updateApartment(body);
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
| **apartmentId** | `number` |  | [Defaults to `undefined`] |
| **roomUpdateRequest** | [RoomUpdateRequest](RoomUpdateRequest.md) |  | |

### Return type

[**Apartment**](Apartment.md)

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

