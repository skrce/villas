
# CollectionRow


## Properties

Name | Type
------------ | -------------
`amountCents` | number
`collectedCents` | number
`effectiveDate` | string
`entryId` | string
`guestName` | string
`kind` | string
`method` | string
`paymentId` | string
`recordedAt` | string
`reference` | string
`refundedCents` | number
`reservationId` | number
`reversedById` | string
`reversesId` | string

## Example

```typescript
import type { CollectionRow } from ''

// TODO: Update the object below with actual values
const example = {
  "amountCents": null,
  "collectedCents": null,
  "effectiveDate": null,
  "entryId": null,
  "guestName": null,
  "kind": null,
  "method": null,
  "paymentId": null,
  "recordedAt": null,
  "reference": null,
  "refundedCents": null,
  "reservationId": null,
  "reversedById": null,
  "reversesId": null,
} satisfies CollectionRow

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as CollectionRow
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


