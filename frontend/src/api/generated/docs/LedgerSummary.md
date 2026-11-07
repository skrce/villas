
# LedgerSummary


## Properties

Name | Type
------------ | -------------
`accommodationCents` | number
`agreedCents` | number
`creditCents` | number
`currency` | string
`outstandingCents` | number
`propertyDate` | string
`reservation` | [ReservationInfo](ReservationInfo.md)
`totals` | [LedgerTotals](LedgerTotals.md)

## Example

```typescript
import type { LedgerSummary } from ''

// TODO: Update the object below with actual values
const example = {
  "accommodationCents": null,
  "agreedCents": null,
  "creditCents": null,
  "currency": null,
  "outstandingCents": null,
  "propertyDate": null,
  "reservation": null,
  "totals": null,
} satisfies LedgerSummary

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as LedgerSummary
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


