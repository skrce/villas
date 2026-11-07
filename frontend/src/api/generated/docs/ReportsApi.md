# ReportsApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**exportReport**](ReportsApi.md#exportreport) | **GET** /reports/export | Download a bounded UTF-8 CSV only when its source snapshot still matches the reviewed report |
| [**periodReport**](ReportsApi.md#periodreport) | **GET** /reports | Read a complete bounded report with definitions and source drill-downs |
| [**today**](ReportsApi.md#today) | **GET** /today | Read a consistent Owner-only snapshot of today\&#39;s work and current balance attention |



## exportReport

> string exportReport(kind, startDate, endDate, snapshotId, roomId)

Download a bounded UTF-8 CSV only when its source snapshot still matches the reviewed report

### Example

```ts
import {
  Configuration,
  ReportsApi,
} from '';
import type { ExportReportRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new ReportsApi(config);

  const body = {
    // 'OCCUPANCY' | 'CHARGES' | 'COLLECTIONS' | 'BALANCES'
    kind: kind_example,
    // string
    startDate: startDate_example,
    // string
    endDate: endDate_example,
    // string
    snapshotId: snapshotId_example,
    // number (optional)
    roomId: 56,
  } satisfies ExportReportRequest;

  try {
    const data = await api.exportReport(body);
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
| **kind** | `OCCUPANCY`, `CHARGES`, `COLLECTIONS`, `BALANCES` |  | [Defaults to `undefined`] [Enum: OCCUPANCY, CHARGES, COLLECTIONS, BALANCES] |
| **startDate** | `string` |  | [Defaults to `undefined`] |
| **endDate** | `string` |  | [Defaults to `undefined`] |
| **snapshotId** | `string` |  | [Defaults to `undefined`] |
| **roomId** | `number` |  | [Optional] [Defaults to `undefined`] |

### Return type

**string**

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


## periodReport

> PeriodReport periodReport(kind, startDate, endDate, roomId)

Read a complete bounded report with definitions and source drill-downs

### Example

```ts
import {
  Configuration,
  ReportsApi,
} from '';
import type { PeriodReportRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new ReportsApi(config);

  const body = {
    // 'OCCUPANCY' | 'CHARGES' | 'COLLECTIONS' | 'BALANCES'
    kind: kind_example,
    // string
    startDate: startDate_example,
    // string
    endDate: endDate_example,
    // number (optional)
    roomId: 56,
  } satisfies PeriodReportRequest;

  try {
    const data = await api.periodReport(body);
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
| **kind** | `OCCUPANCY`, `CHARGES`, `COLLECTIONS`, `BALANCES` |  | [Defaults to `undefined`] [Enum: OCCUPANCY, CHARGES, COLLECTIONS, BALANCES] |
| **startDate** | `string` |  | [Defaults to `undefined`] |
| **endDate** | `string` |  | [Defaults to `undefined`] |
| **roomId** | `number` |  | [Optional] [Defaults to `undefined`] |

### Return type

[**PeriodReport**](PeriodReport.md)

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


## today

> TodayView today()

Read a consistent Owner-only snapshot of today\&#39;s work and current balance attention

### Example

```ts
import {
  Configuration,
  ReportsApi,
} from '';
import type { TodayRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new ReportsApi(config);

  try {
    const data = await api.today();
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

[**TodayView**](TodayView.md)

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

