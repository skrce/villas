
# AcceptedPrice


## Properties

Name | Type
------------ | -------------
`acceptedAt` | Date
`quote` | [BookingQuote](BookingQuote.md)
`reservationId` | number
`reservationVersion` | number

## Example

```typescript
import type { AcceptedPrice } from ''

// TODO: Update the object below with actual values
const example = {
  "acceptedAt": null,
  "quote": null,
  "reservationId": null,
  "reservationVersion": null,
} satisfies AcceptedPrice

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as AcceptedPrice
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


