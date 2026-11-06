
# PriceLine


## Properties

Name | Type
------------ | -------------
`endDate` | string
`name` | string
`nightlyCents` | number
`nights` | number
`startDate` | string
`subtotalCents` | number

## Example

```typescript
import type { PriceLine } from ''

// TODO: Update the object below with actual values
const example = {
  "endDate": null,
  "name": null,
  "nightlyCents": null,
  "nights": null,
  "startDate": null,
  "subtotalCents": null,
} satisfies PriceLine

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PriceLine
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


