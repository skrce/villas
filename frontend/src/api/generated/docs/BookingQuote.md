
# BookingQuote


## Properties

Name | Type
------------ | -------------
`createdAt` | Date
`endDate` | string
`expiresAt` | Date
`guestCount` | number
`id` | string
`price` | [StayPrice](StayPrice.md)
`roomId` | number
`startDate` | string

## Example

```typescript
import type { BookingQuote } from ''

// TODO: Update the object below with actual values
const example = {
  "createdAt": null,
  "endDate": null,
  "expiresAt": null,
  "guestCount": null,
  "id": null,
  "price": null,
  "roomId": null,
  "startDate": null,
} satisfies BookingQuote

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as BookingQuote
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


