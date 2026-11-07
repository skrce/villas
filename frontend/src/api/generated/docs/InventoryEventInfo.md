
# InventoryEventInfo


## Properties

Name | Type
------------ | -------------
`actorId` | string
`checkedInAt` | string
`checkedOutAt` | string
`endDate` | Date
`guestCount` | number
`id` | string
`kind` | string
`occurredAt` | Date
`operationKey` | string
`phase` | string
`previousRoomId` | number
`reason` | string
`resourceVersion` | number
`roomId` | number
`startDate` | Date

## Example

```typescript
import type { InventoryEventInfo } from ''

// TODO: Update the object below with actual values
const example = {
  "actorId": null,
  "checkedInAt": null,
  "checkedOutAt": null,
  "endDate": null,
  "guestCount": null,
  "id": null,
  "kind": null,
  "occurredAt": null,
  "operationKey": null,
  "phase": null,
  "previousRoomId": null,
  "reason": null,
  "resourceVersion": null,
  "roomId": null,
  "startDate": null,
} satisfies InventoryEventInfo

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as InventoryEventInfo
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


