
# ReportTotals


## Properties

Name | Type
------------ | -------------
`blockedNights` | number
`bookedNights` | number
`chargeCents` | number
`collectedCents` | number
`creditCents` | number
`knownChargeCents` | number
`knownCreditCents` | number
`knownOutstandingCents` | number
`netCollectedCents` | number
`outstandingCents` | number
`refundedCents` | number
`roomNights` | number
`sellableNights` | number
`unknownPriceCount` | number

## Example

```typescript
import type { ReportTotals } from ''

// TODO: Update the object below with actual values
const example = {
  "blockedNights": null,
  "bookedNights": null,
  "chargeCents": null,
  "collectedCents": null,
  "creditCents": null,
  "knownChargeCents": null,
  "knownCreditCents": null,
  "knownOutstandingCents": null,
  "netCollectedCents": null,
  "outstandingCents": null,
  "refundedCents": null,
  "roomNights": null,
  "sellableNights": null,
  "unknownPriceCount": null,
} satisfies ReportTotals

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ReportTotals
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


