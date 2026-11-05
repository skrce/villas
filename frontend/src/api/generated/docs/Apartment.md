
# Apartment


## Properties

Name | Type
------------ | -------------
`active` | boolean
`capacity` | number
`id` | number
`orientation` | string
`regularPrice` | number
`topSeasonPrice` | number
`version` | number
`view` | string

## Example

```typescript
import type { Apartment } from ''

// TODO: Update the object below with actual values
const example = {
  "active": null,
  "capacity": null,
  "id": null,
  "orientation": null,
  "regularPrice": null,
  "topSeasonPrice": null,
  "version": null,
  "view": null,
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


