
# TodayBalances


## Properties

Name | Type
------------ | -------------
`creditCents` | number
`creditCount` | number
`items` | [Array&lt;BalanceRow&gt;](BalanceRow.md)
`outstandingCents` | number
`outstandingCount` | number
`unknownCount` | number

## Example

```typescript
import type { TodayBalances } from ''

// TODO: Update the object below with actual values
const example = {
  "creditCents": null,
  "creditCount": null,
  "items": null,
  "outstandingCents": null,
  "outstandingCount": null,
  "unknownCount": null,
} satisfies TodayBalances

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as TodayBalances
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


