
# RefundRequest


## Properties

Name | Type
------------ | -------------
`amountCents` | number
`currency` | string
`effectiveDate` | string
`expectedVersion` | number
`method` | string
`paymentId` | string
`reason` | string
`reference` | string

## Example

```typescript
import type { RefundRequest } from ''

// TODO: Update the object below with actual values
const example = {
  "amountCents": null,
  "currency": null,
  "effectiveDate": null,
  "expectedVersion": null,
  "method": null,
  "paymentId": null,
  "reason": null,
  "reference": null,
} satisfies RefundRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as RefundRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


