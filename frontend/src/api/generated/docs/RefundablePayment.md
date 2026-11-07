
# RefundablePayment


## Properties

Name | Type
------------ | -------------
`entry` | [LedgerEntryInfo](LedgerEntryInfo.md)
`refundableCents` | number

## Example

```typescript
import type { RefundablePayment } from ''

// TODO: Update the object below with actual values
const example = {
  "entry": null,
  "refundableCents": null,
} satisfies RefundablePayment

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as RefundablePayment
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


