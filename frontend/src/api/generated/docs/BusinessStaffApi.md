# BusinessStaffApi

All URIs are relative to */api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**businessStaff**](BusinessStaffApi.md#businessstaff) | **GET** /businesses/{businessId}/staff | Read Owner memberships in an explicitly authorized business |
| [**businessStaffInvitations**](BusinessStaffApi.md#businessstaffinvitations) | **GET** /businesses/{businessId}/staff/invitations | Read invitations in an explicitly authorized business |
| [**deactivateBusinessOwner**](BusinessStaffApi.md#deactivatebusinessowner) | **POST** /businesses/{businessId}/staff/{staffId}/deactivate | Deactivate an Owner membership in one business |
| [**inviteBusinessOwner**](BusinessStaffApi.md#invitebusinessowner) | **POST** /businesses/{businessId}/staff/invitations | Invite an Owner to an explicitly authorized business |
| [**revokeBusinessInvitation**](BusinessStaffApi.md#revokebusinessinvitation) | **DELETE** /businesses/{businessId}/staff/invitations/{invitationId} | Revoke an invitation in an explicitly authorized business |
| [**revokeBusinessSessions**](BusinessStaffApi.md#revokebusinesssessions) | **POST** /businesses/{businessId}/staff/{staffId}/revoke-sessions | Revoke existing session grants for one business membership |



<a id="businessstaff"></a>
## businessStaff

> Array&lt;StaffView&gt; businessStaff(businessId)

Read Owner memberships in an explicitly authorized business

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **businessId** | `string` |  | [Defaults to `undefined`] |

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


<a id="businessstaffinvitations"></a>
## businessStaffInvitations

> Array&lt;InvitationView&gt; businessStaffInvitations(businessId)

Read invitations in an explicitly authorized business

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **businessId** | `string` |  | [Defaults to `undefined`] |

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


<a id="deactivatebusinessowner"></a>
## deactivateBusinessOwner

> StaffView deactivateBusinessOwner(businessId, staffId, staffVersionRequest)

Deactivate an Owner membership in one business

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **businessId** | `string` |  | [Defaults to `undefined`] |
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


<a id="invitebusinessowner"></a>
## inviteBusinessOwner

> InvitationView inviteBusinessOwner(businessId, inviteOwnerRequest)

Invite an Owner to an explicitly authorized business

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **businessId** | `string` |  | [Defaults to `undefined`] |
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


<a id="revokebusinessinvitation"></a>
## revokeBusinessInvitation

> InvitationView revokeBusinessInvitation(businessId, invitationId, staffVersionRequest)

Revoke an invitation in an explicitly authorized business

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **businessId** | `string` |  | [Defaults to `undefined`] |
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


<a id="revokebusinesssessions"></a>
## revokeBusinessSessions

> StaffView revokeBusinessSessions(businessId, staffId, staffVersionRequest)

Revoke existing session grants for one business membership

Use the Villas session-aware clients described in [client configuration](../README.md#authorization).

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **businessId** | `string` |  | [Defaults to `undefined`] |
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

