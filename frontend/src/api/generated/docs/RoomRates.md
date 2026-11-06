
# RoomRates


## Properties

Name | Type
------------ | -------------
`baseNightlyCents` | number
`currency` | string
`roomId` | number
`seasons` | [Array&lt;SeasonRate&gt;](SeasonRate.md)
`version` | number

## Example

```typescript
import type { RoomRates } from ''

// TODO: Update the object below with actual values
const example = {
  "baseNightlyCents": null,
  "currency": null,
  "roomId": null,
  "seasons": null,
  "version": null,
} satisfies RoomRates

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as RoomRates
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


