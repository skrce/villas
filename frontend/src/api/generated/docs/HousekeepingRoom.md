
# HousekeepingRoom


## Properties

Name | Type
------------ | -------------
`maintenance` | [Array&lt;CalendarMaintenance&gt;](CalendarMaintenance.md)
`name` | string
`occupied` | boolean
`readiness` | [ReadinessView](ReadinessView.md)
`reference` | string
`roomId` | number

## Example

```typescript
import type { HousekeepingRoom } from ''

// TODO: Update the object below with actual values
const example = {
  "maintenance": null,
  "name": null,
  "occupied": null,
  "readiness": null,
  "reference": null,
  "roomId": null,
} satisfies HousekeepingRoom

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as HousekeepingRoom
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


