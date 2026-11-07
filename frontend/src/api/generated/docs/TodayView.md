
# TodayView


## Properties

Name | Type
------------ | -------------
`activeRooms` | number
`arrivals` | [TodayQueue](TodayQueue.md)
`attention` | [TodayQueue](TodayQueue.md)
`balances` | [TodayBalances](TodayBalances.md)
`blockedRooms` | number
`cleanRooms` | number
`cleaningRooms` | number
`departures` | [TodayQueue](TodayQueue.md)
`dirtyRooms` | number
`guestsInHouse` | number
`inHouse` | [TodayQueue](TodayQueue.md)
`inspectionRooms` | number
`propertyDate` | string
`readAt` | string
`roomsWithoutRates` | number

## Example

```typescript
import type { TodayView } from ''

// TODO: Update the object below with actual values
const example = {
  "activeRooms": null,
  "arrivals": null,
  "attention": null,
  "balances": null,
  "blockedRooms": null,
  "cleanRooms": null,
  "cleaningRooms": null,
  "departures": null,
  "dirtyRooms": null,
  "guestsInHouse": null,
  "inHouse": null,
  "inspectionRooms": null,
  "propertyDate": null,
  "readAt": null,
  "roomsWithoutRates": null,
} satisfies TodayView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as TodayView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


