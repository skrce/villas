
# FrontDeskPage


## Properties

Name | Type
------------ | -------------
`items` | [Array&lt;FrontDeskStay&gt;](FrontDeskStay.md)
`list` | string
`nextCursor` | number
`propertyDate` | string

## Example

```typescript
import type { FrontDeskPage } from ''

// TODO: Update the object below with actual values
const example = {
  "items": null,
  "list": null,
  "nextCursor": null,
  "propertyDate": null,
} satisfies FrontDeskPage

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as FrontDeskPage
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


