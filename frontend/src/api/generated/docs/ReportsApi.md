# ReportsApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**exportReport**](ReportsApi.md#exportreport) | **GET** /reports/export | Download a bounded UTF-8 CSV only when its source snapshot still matches the reviewed report |
| [**readPeriodReport**](ReportsApi.md#readperiodreport) | **GET** /reports | Read a complete bounded report with definitions and source drill-downs |
| [**today**](ReportsApi.md#today) | **GET** /today | Read a consistent Owner-only snapshot of today\&#39;s work and current balance attention |



<a id="exportreport"></a>
## exportReport

> string exportReport(kind, startDate, endDate, snapshotId, roomId)

Download a bounded UTF-8 CSV only when its source snapshot still matches the reviewed report

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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


<a id="readperiodreport"></a>
## readPeriodReport

> PeriodReport readPeriodReport(kind, startDate, endDate, roomId)

Read a complete bounded report with definitions and source drill-downs

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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


<a id="today"></a>
## today

> TodayView today()

Read a consistent Owner-only snapshot of today\&#39;s work and current balance attention

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters

This endpoint does not need any parameter.

### Return type

[**TodayView**](TodayView.md)

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

