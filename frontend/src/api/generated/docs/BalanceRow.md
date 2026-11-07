
# BalanceRow


## Properties

Name | Type
------------ | -------------
`accommodationCents` | number
`agreedCents` | number
`creditCents` | number
`endDate` | string
`guestName` | string
`outstandingCents` | number
`phase` | string
`receivedCents` | number
`reservationId` | number
`startDate` | string

## Example

```typescript
import type { BalanceRow } from ''

// TODO: Update the object below with actual values
const example = {
  "accommodationCents": null,
  "agreedCents": null,
  "creditCents": null,
  "endDate": null,
  "guestName": null,
  "outstandingCents": null,
  "phase": null,
  "receivedCents": null,
  "reservationId": null,
  "startDate": null,
} satisfies BalanceRow

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as BalanceRow
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


