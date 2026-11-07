
# ReservationInfo


## Properties

Name | Type
------------ | -------------
`acceptedQuoteId` | string
`checkedInAt` | string
`checkedOutAt` | string
`customerId` | number
`endDate` | string
`guestCount` | number
`id` | number
`nights` | number
`phase` | string
`roomFromDate` | string
`roomId` | number
`startDate` | string
`status` | string
`version` | number

## Example

```typescript
import type { ReservationInfo } from ''

// TODO: Update the object below with actual values
const example = {
  "acceptedQuoteId": null,
  "checkedInAt": null,
  "checkedOutAt": null,
  "customerId": null,
  "endDate": null,
  "guestCount": null,
  "id": null,
  "nights": null,
  "phase": null,
  "roomFromDate": null,
  "roomId": null,
  "startDate": null,
  "status": null,
  "version": null,
} satisfies ReservationInfo

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ReservationInfo
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


