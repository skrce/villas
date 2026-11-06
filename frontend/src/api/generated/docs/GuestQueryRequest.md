
# GuestQueryRequest


## Properties

Name | Type
------------ | -------------
`afterId` | number
`includeArchived` | boolean
`limit` | number
`name` | string
`phone` | string

## Example

```typescript
import type { GuestQueryRequest } from ''

// TODO: Update the object below with actual values
const example = {
  "afterId": null,
  "includeArchived": null,
  "limit": null,
  "name": null,
  "phone": null,
} satisfies GuestQueryRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as GuestQueryRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


