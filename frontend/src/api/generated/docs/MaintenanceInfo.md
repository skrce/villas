
# MaintenanceInfo


## Properties

Name | Type
------------ | -------------
`endDate` | Date
`id` | number
`reason` | string
`roomId` | number
`startDate` | Date
`status` | string
`version` | number

## Example

```typescript
import type { MaintenanceInfo } from ''

// TODO: Update the object below with actual values
const example = {
  "endDate": null,
  "id": null,
  "reason": null,
  "roomId": null,
  "startDate": null,
  "status": null,
  "version": null,
} satisfies MaintenanceInfo

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as MaintenanceInfo
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


