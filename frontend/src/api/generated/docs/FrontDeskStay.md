
# FrontDeskStay


## Properties

Name | Type
------------ | -------------
`guestName` | string
`reservation` | [ReservationInfo](ReservationInfo.md)
`roomName` | string
`roomReference` | string

## Example

```typescript
import type { FrontDeskStay } from ''

// TODO: Update the object below with actual values
const example = {
  "guestName": null,
  "reservation": null,
  "roomName": null,
  "roomReference": null,
} satisfies FrontDeskStay

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as FrontDeskStay
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


