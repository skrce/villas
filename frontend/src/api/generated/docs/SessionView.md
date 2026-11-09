
# SessionView


## Properties

Name | Type
------------ | -------------
`authenticated` | boolean
`csrfToken` | string
`expiresAt` | Date
`generation` | string
`identity` | [IdentityView](IdentityView.md)
`memberships` | [Array&lt;BusinessMembershipView&gt;](BusinessMembershipView.md)
`permissions` | Array&lt;string&gt;
`propertyId` | string
`propertyName` | string
`provider` | string
`staff` | [StaffView](StaffView.md)

## Example

```typescript
import type { SessionView } from ''

// TODO: Update the object below with actual values
const example = {
  "authenticated": null,
  "csrfToken": null,
  "expiresAt": null,
  "generation": null,
  "identity": null,
  "memberships": null,
  "permissions": null,
  "propertyId": null,
  "propertyName": null,
  "provider": null,
  "staff": null,
} satisfies SessionView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SessionView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


