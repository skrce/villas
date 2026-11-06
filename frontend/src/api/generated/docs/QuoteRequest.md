
# QuoteRequest


## Properties

Name | Type
------------ | -------------
`currency` | string
`endDate` | string
`guestCount` | number
`roomId` | number
`startDate` | string

## Example

```typescript
import type { QuoteRequest } from ''

// TODO: Update the object below with actual values
const example = {
  "currency": null,
  "endDate": null,
  "guestCount": null,
  "roomId": null,
  "startDate": null,
} satisfies QuoteRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as QuoteRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


