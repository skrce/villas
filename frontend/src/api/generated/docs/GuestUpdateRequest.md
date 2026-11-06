
# GuestUpdateRequest


## Properties

Name | Type
------------ | -------------
`address` | string
`email` | string
`expectedVersion` | number
`firstName` | string
`lastName` | string
`notes` | string
`phone` | string

## Example

```typescript
import type { GuestUpdateRequest } from ''

// TODO: Update the object below with actual values
const example = {
  "address": null,
  "email": null,
  "expectedVersion": null,
  "firstName": null,
  "lastName": null,
  "notes": null,
  "phone": null,
} satisfies GuestUpdateRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as GuestUpdateRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


