# StaffApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**deactivateStaff**](StaffApi.md#deactivatestaff) | **POST** /staff/{staffId}/deactivate | Deactivate an Owner while retaining the last active Owner |
| [**inviteOwner**](StaffApi.md#inviteowneroperation) | **POST** /staff/invitations | Invite a Google account as an Owner |
| [**listStaff**](StaffApi.md#liststaff) | **GET** /staff | Read Owner accounts |
| [**listStaffInvitations**](StaffApi.md#liststaffinvitations) | **GET** /staff/invitations | Read unexpired Owner invitations |
| [**logoutStaff**](StaffApi.md#logoutstaff) | **POST** /auth/logout | Invalidate the current staff session |
| [**myBusinessMemberships**](StaffApi.md#mybusinessmemberships) | **GET** /auth/memberships | Read only the caller\&#39;s current authorized business memberships |
| [**revokeStaffInvitation**](StaffApi.md#revokestaffinvitation) | **DELETE** /staff/invitations/{invitationId} | Revoke an unclaimed invitation |
| [**revokeStaffSessions**](StaffApi.md#revokestaffsessions) | **POST** /staff/{staffId}/revoke-sessions | Invalidate every current session for an Owner |
| [**staffSession**](StaffApi.md#staffsession) | **GET** /auth/session | Read the current server-side staff session |



<a id="deactivatestaff"></a>
## deactivateStaff

> StaffView deactivateStaff(staffId, staffVersionRequest)

Deactivate an Owner while retaining the last active Owner

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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


<a id="inviteowneroperation"></a>
## inviteOwner

> InvitationView inviteOwner(inviteOwnerRequest)

Invite a Google account as an Owner

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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


<a id="liststaff"></a>
## listStaff

> Array&lt;StaffView&gt; listStaff()

Read Owner accounts

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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


<a id="liststaffinvitations"></a>
## listStaffInvitations

> Array&lt;InvitationView&gt; listStaffInvitations()

Read unexpired Owner invitations

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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


<a id="logoutstaff"></a>
## logoutStaff

> logoutStaff()

Invalidate the current staff session

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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


<a id="mybusinessmemberships"></a>
## myBusinessMemberships

> Array&lt;BusinessMembershipView&gt; myBusinessMemberships()

Read only the caller\&#39;s current authorized business memberships

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters

This endpoint does not need any parameter.

### Return type

[**Array&lt;BusinessMembershipView&gt;**](BusinessMembershipView.md)

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


<a id="revokestaffinvitation"></a>
## revokeStaffInvitation

> InvitationView revokeStaffInvitation(invitationId, staffVersionRequest)

Revoke an unclaimed invitation

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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


<a id="revokestaffsessions"></a>
## revokeStaffSessions

> StaffView revokeStaffSessions(staffId, staffVersionRequest)

Invalidate every current session for an Owner

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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


<a id="staffsession"></a>
## staffSession

> SessionView staffSession()

Read the current server-side staff session

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

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

