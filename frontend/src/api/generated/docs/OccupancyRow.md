
# OccupancyRow


## Properties

Name | Type
------------ | -------------
`active` | boolean
`blockedNights` | number
`bookedNights` | number
`roomId` | number
`roomName` | string
`roomNights` | number
`roomReference` | string
`sellableNights` | number

## Example

```typescript
import type { OccupancyRow } from ''

// TODO: Update the object below with actual values
const example = {
  "active": null,
  "blockedNights": null,
  "bookedNights": null,
  "roomId": null,
  "roomName": null,
  "roomNights": null,
  "roomReference": null,
  "sellableNights": null,
} satisfies OccupancyRow

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as OccupancyRow
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


