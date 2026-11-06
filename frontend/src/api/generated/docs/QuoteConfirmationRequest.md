
# QuoteConfirmationRequest


## Properties

Name | Type
------------ | -------------
`customerId` | number
`endDate` | string
`guestCount` | number
`quoteId` | string
`roomId` | number
`startDate` | string

## Example

```typescript
import type { QuoteConfirmationRequest } from ''

// TODO: Update the object below with actual values
const example = {
  "customerId": null,
  "endDate": null,
  "guestCount": null,
  "quoteId": null,
  "roomId": null,
  "startDate": null,
} satisfies QuoteConfirmationRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as QuoteConfirmationRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


