
# HousekeepingPage


## Properties

Name | Type
------------ | -------------
`maintenanceUntil` | string
`nextCursor` | number
`propertyDate` | string
`rooms` | [Array&lt;HousekeepingRoom&gt;](HousekeepingRoom.md)

## Example

```typescript
import type { HousekeepingPage } from ''

// TODO: Update the object below with actual values
const example = {
  "maintenanceUntil": null,
  "nextCursor": null,
  "propertyDate": null,
  "rooms": null,
} satisfies HousekeepingPage

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as HousekeepingPage
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


