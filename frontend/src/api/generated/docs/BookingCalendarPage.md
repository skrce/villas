
# BookingCalendarPage


## Properties

Name | Type
------------ | -------------
`endDate` | string
`maintenance` | [Array&lt;CalendarMaintenance&gt;](CalendarMaintenance.md)
`nextRoomCursor` | number
`rooms` | [Array&lt;CalendarRoom&gt;](CalendarRoom.md)
`startDate` | string
`stays` | [Array&lt;CalendarStay&gt;](CalendarStay.md)

## Example

```typescript
import type { BookingCalendarPage } from ''

// TODO: Update the object below with actual values
const example = {
  "endDate": null,
  "maintenance": null,
  "nextRoomCursor": null,
  "rooms": null,
  "startDate": null,
  "stays": null,
} satisfies BookingCalendarPage

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as BookingCalendarPage
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


