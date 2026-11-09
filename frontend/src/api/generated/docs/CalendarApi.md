# CalendarApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**bookingCalendar**](CalendarApi.md#bookingcalendar) | **GET** /calendar | Read a bounded consistent room calendar of active stays and maintenance |



<a id="bookingcalendar"></a>
## bookingCalendar

> BookingCalendarPage bookingCalendar(startDate, endDate, afterRoomId, limit, includeArchived)

Read a bounded consistent room calendar of active stays and maintenance

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **startDate** | `string` |  | [Defaults to `undefined`] |
| **endDate** | `string` |  | [Defaults to `undefined`] |
| **afterRoomId** | `number` |  | [Optional] [Defaults to `0`] |
| **limit** | `number` |  | [Optional] [Defaults to `20`] |
| **includeArchived** | `boolean` |  | [Optional] [Defaults to `false`] |

### Return type

[**BookingCalendarPage**](BookingCalendarPage.md)

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

