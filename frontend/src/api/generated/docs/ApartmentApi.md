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



<a id="apartmentdirectory"></a>
## apartmentDirectory

> RoomPage apartmentDirectory(name, includeArchived, afterId, limit)

Read a bounded room directory by name or reference

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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


<a id="blockapartment"></a>
## blockApartment

> MaintenanceInfo blockApartment(apartmentId, idempotencyKey, roomBlockRequest)

Add a dated maintenance block using a private JSON body

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **apartmentId** | `number` |  | [Defaults to `undefined`] |
| **idempotencyKey** | `string` |  | [Defaults to `undefined`] |
| **roomBlockRequest** | [RoomBlockRequest](RoomBlockRequest.md) |  | |

### Return type

[**MaintenanceInfo**](MaintenanceInfo.md)

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


<a id="createapartment"></a>
## createApartment

> Apartment createApartment(roomCreateRequest)

Add a named room with a unique property reference

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **roomCreateRequest** | [RoomCreateRequest](RoomCreateRequest.md) |  | |

### Return type

[**Apartment**](Apartment.md)

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


<a id="getapartment"></a>
## getApartment

> Apartment getApartment(apartmentId)

Read a property-scoped current or archived room

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **apartmentId** | `number` |  | [Defaults to `undefined`] |

### Return type

[**Apartment**](Apartment.md)

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


<a id="listapartments"></a>
## listApartments

> Array&lt;Apartment&gt; listApartments()

List rooms for compatibility and booking selectors

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters

This endpoint does not need any parameter.

### Return type

[**Array&lt;Apartment&gt;**](Apartment.md)

### Authorization

[staffSession](../README.md#staffSession), [businessSelection](../README.md#businessSelection)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`, `*/*`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


<a id="setapartmentstatus"></a>
## setApartmentStatus

> Apartment setApartmentStatus(apartmentId, recordStatusRequest)

Archive or restore a room while retaining its history

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **apartmentId** | `number` |  | [Defaults to `undefined`] |
| **recordStatusRequest** | [RecordStatusRequest](RecordStatusRequest.md) |  | |

### Return type

[**Apartment**](Apartment.md)

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


<a id="updateapartment"></a>
## updateApartment

> Apartment updateApartment(apartmentId, roomUpdateRequest)

Edit a reviewed room without invalidating current or future stays

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **apartmentId** | `number` |  | [Defaults to `undefined`] |
| **roomUpdateRequest** | [RoomUpdateRequest](RoomUpdateRequest.md) |  | |

### Return type

[**Apartment**](Apartment.md)

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

