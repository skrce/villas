# StaffApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**deactivateStaff**](StaffApi.md#deactivatestaff) | **POST** /staff/{staffId}/deactivate | Deactivate an Owner while retaining the last active Owner |
| [**inviteOwner**](StaffApi.md#inviteowneroperation) | **POST** /staff/invitations | Invite a Google account as an Owner |
| [**listStaff**](StaffApi.md#liststaff) | **GET** /staff | Read Owner accounts |
| [**listStaffInvitations**](StaffApi.md#liststaffinvitations) | **GET** /staff/invitations | Read unexpired Owner invitations |
| [**logoutStaff**](StaffApi.md#logoutstaff) | **POST** /auth/logout | Invalidate the current staff session |
| [**revokeStaffInvitation**](StaffApi.md#revokestaffinvitation) | **DELETE** /staff/invitations/{invitationId} | Revoke an unclaimed invitation |
| [**revokeStaffSessions**](StaffApi.md#revokestaffsessions) | **POST** /staff/{staffId}/revoke-sessions | Invalidate every current session for an Owner |
| [**staffSession**](StaffApi.md#staffsession) | **GET** /auth/session | Read the current server-side staff session |



## deactivateStaff

> StaffView deactivateStaff(staffId, staffVersionRequest)

Deactivate an Owner while retaining the last active Owner

### Example

```ts
import {
  Configuration,
  StaffApi,
} from '';
import type { DeactivateStaffRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new StaffApi(config);

  const body = {
    // string
    staffId: staffId_example,
    // StaffVersionRequest
    staffVersionRequest: ...,
  } satisfies DeactivateStaffRequest;

  try {
    const data = await api.deactivateStaff(body);
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
| **staffId** | `string` |  | [Defaults to `undefined`] |
| **staffVersionRequest** | [StaffVersionRequest](StaffVersionRequest.md) |  | |

### Return type

[**StaffView**](StaffView.md)

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


## inviteOwner

> InvitationView inviteOwner(inviteOwnerRequest)

Invite a Google account as an Owner

### Example

```ts
import {
  Configuration,
  StaffApi,
} from '';
import type { InviteOwnerOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new StaffApi(config);

  const body = {
    // InviteOwnerRequest
    inviteOwnerRequest: ...,
  } satisfies InviteOwnerOperationRequest;

  try {
    const data = await api.inviteOwner(body);
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
| **inviteOwnerRequest** | [InviteOwnerRequest](InviteOwnerRequest.md) |  | |

### Return type

[**InvitationView**](InvitationView.md)

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


## listStaff

> Array&lt;StaffView&gt; listStaff()

Read Owner accounts

### Example

```ts
import {
  Configuration,
  StaffApi,
} from '';
import type { ListStaffRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new StaffApi(config);

  try {
    const data = await api.listStaff();
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

[**Array&lt;StaffView&gt;**](StaffView.md)

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


## listStaffInvitations

> Array&lt;InvitationView&gt; listStaffInvitations()

Read unexpired Owner invitations

### Example

```ts
import {
  Configuration,
  StaffApi,
} from '';
import type { ListStaffInvitationsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new StaffApi(config);

  try {
    const data = await api.listStaffInvitations();
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

[**Array&lt;InvitationView&gt;**](InvitationView.md)

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


## logoutStaff

> logoutStaff()

Invalidate the current staff session

### Example

```ts
import {
  Configuration,
  StaffApi,
} from '';
import type { LogoutStaffRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new StaffApi(config);

  try {
    const data = await api.logoutStaff();
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

`void` (Empty response body)

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


## revokeStaffInvitation

> InvitationView revokeStaffInvitation(invitationId, staffVersionRequest)

Revoke an unclaimed invitation

### Example

```ts
import {
  Configuration,
  StaffApi,
} from '';
import type { RevokeStaffInvitationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new StaffApi(config);

  const body = {
    // string
    invitationId: invitationId_example,
    // StaffVersionRequest
    staffVersionRequest: ...,
  } satisfies RevokeStaffInvitationRequest;

  try {
    const data = await api.revokeStaffInvitation(body);
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
| **invitationId** | `string` |  | [Defaults to `undefined`] |
| **staffVersionRequest** | [StaffVersionRequest](StaffVersionRequest.md) |  | |

### Return type

[**InvitationView**](InvitationView.md)

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


## revokeStaffSessions

> StaffView revokeStaffSessions(staffId, staffVersionRequest)

Invalidate every current session for an Owner

### Example

```ts
import {
  Configuration,
  StaffApi,
} from '';
import type { RevokeStaffSessionsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new StaffApi(config);

  const body = {
    // string
    staffId: staffId_example,
    // StaffVersionRequest
    staffVersionRequest: ...,
  } satisfies RevokeStaffSessionsRequest;

  try {
    const data = await api.revokeStaffSessions(body);
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
| **staffId** | `string` |  | [Defaults to `undefined`] |
| **staffVersionRequest** | [StaffVersionRequest](StaffVersionRequest.md) |  | |

### Return type

[**StaffView**](StaffView.md)

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


## staffSession

> SessionView staffSession()

Read the current server-side staff session

### Example

```ts
import {
  Configuration,
  StaffApi,
} from '';
import type { StaffSessionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: staffSession
    apiKey: "YOUR API KEY",
  });
  const api = new StaffApi(config);

  try {
    const data = await api.staffSession();
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

[**SessionView**](SessionView.md)

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

