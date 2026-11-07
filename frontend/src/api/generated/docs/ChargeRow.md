
# ChargeRow


## Properties

Name | Type
------------ | -------------
`chargeCents` | number
`endDate` | string
`guestName` | string
`nights` | number
`phase` | string
`quoteId` | string
`reservationId` | number
`roomId` | number
`roomName` | string
`roomReference` | string
`startDate` | string

## Example

```typescript
import type { ChargeRow } from ''

// TODO: Update the object below with actual values
const example = {
  "chargeCents": null,
  "endDate": null,
  "guestName": null,
  "nights": null,
  "phase": null,
  "quoteId": null,
  "reservationId": null,
  "roomId": null,
  "roomName": null,
  "roomReference": null,
  "startDate": null,
} satisfies ChargeRow

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ChargeRow
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


