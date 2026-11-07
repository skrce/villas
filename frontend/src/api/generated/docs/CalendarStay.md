
# CalendarStay


## Properties

Name | Type
------------ | -------------
`allocationId` | string
`customerId` | number
`endDate` | string
`guestCount` | number
`guestName` | string
`id` | number
`phase` | string
`roomId` | number
`startDate` | string
`status` | string
`version` | number

## Example

```typescript
import type { CalendarStay } from ''

// TODO: Update the object below with actual values
const example = {
  "allocationId": null,
  "customerId": null,
  "endDate": null,
  "guestCount": null,
  "guestName": null,
  "id": null,
  "phase": null,
  "roomId": null,
  "startDate": null,
  "status": null,
  "version": null,
} satisfies CalendarStay

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as CalendarStay
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


