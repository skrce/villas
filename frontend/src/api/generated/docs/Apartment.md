
# Apartment


## Properties

Name | Type
------------ | -------------
`id` | number
`capacity` | number
`orientation` | string
`view` | string
`regularPrice` | number
`topSeasonPrice` | number

## Example

```typescript
import type { Apartment } from ''

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "capacity": null,
  "orientation": null,
  "view": null,
  "regularPrice": null,
  "topSeasonPrice": null,
} satisfies Apartment

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as Apartment
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


