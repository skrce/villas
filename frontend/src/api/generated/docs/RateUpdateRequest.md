
# RateUpdateRequest


## Properties

Name | Type
------------ | -------------
`baseNightlyCents` | number
`currency` | string
`expectedVersion` | number
`seasons` | [Array&lt;SeasonRateRequest&gt;](SeasonRateRequest.md)

## Example

```typescript
import type { RateUpdateRequest } from ''

// TODO: Update the object below with actual values
const example = {
  "baseNightlyCents": null,
  "currency": null,
  "expectedVersion": null,
  "seasons": null,
} satisfies RateUpdateRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as RateUpdateRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


