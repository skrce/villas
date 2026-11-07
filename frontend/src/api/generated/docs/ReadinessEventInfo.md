
# ReadinessEventInfo


## Properties

Name | Type
------------ | -------------
`actorId` | string
`id` | string
`occurredAt` | Date
`operationKey` | string
`previousState` | string
`reason` | string
`reservationId` | number
`state` | string
`version` | number

## Example

```typescript
import type { ReadinessEventInfo } from ''

// TODO: Update the object below with actual values
const example = {
  "actorId": null,
  "id": null,
  "occurredAt": null,
  "operationKey": null,
  "previousState": null,
  "reason": null,
  "reservationId": null,
  "state": null,
  "version": null,
} satisfies ReadinessEventInfo

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ReadinessEventInfo
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


