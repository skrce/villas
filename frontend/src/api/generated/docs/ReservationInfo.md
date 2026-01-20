
# ReservationInfo


## Properties

Name | Type
------------ | -------------
`id` | number
`customerId` | number
`roomId` | number
`startDate` | string
`endDate` | string

## Example

```typescript
import type { ReservationInfo } from ''

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "customerId": null,
  "roomId": null,
  "startDate": null,
  "endDate": null,
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


