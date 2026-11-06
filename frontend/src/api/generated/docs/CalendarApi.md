# CalendarApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**bookingCalendar**](CalendarApi.md#bookingcalendar) | **GET** /calendar | Read a bounded consistent room calendar of active stays and maintenance |



## bookingCalendar

> BookingCalendarPage bookingCalendar(startDate, endDate, afterRoomId, limit, includeArchived)

Read a bounded consistent room calendar of active stays and maintenance

### Example

```ts
import {
  Configuration,
  CalendarApi,
} from '';
import type { BookingCalendarRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new CalendarApi(config);

  const body = {
    // string
    startDate: startDate_example,
    // string
    endDate: endDate_example,
    // number (optional)
    afterRoomId: 56,
    // number (optional)
    limit: 56,
    // boolean (optional)
    includeArchived: true,
  } satisfies BookingCalendarRequest;

  try {
    const data = await api.bookingCalendar(body);
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
| **startDate** | `string` |  | [Defaults to `undefined`] |
| **endDate** | `string` |  | [Defaults to `undefined`] |
| **afterRoomId** | `number` |  | [Optional] [Defaults to `0`] |
| **limit** | `number` |  | [Optional] [Defaults to `20`] |
| **includeArchived** | `boolean` |  | [Optional] [Defaults to `false`] |

### Return type

[**BookingCalendarPage**](BookingCalendarPage.md)

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

