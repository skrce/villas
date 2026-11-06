
# Apartment


## Properties

Name | Type
------------ | -------------
`active` | boolean
`bedConfiguration` | string
`capacity` | number
`features` | string
`floor` | string
`id` | number
`name` | string
`orientation` | string
`reference` | string
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
  "bedConfiguration": null,
  "capacity": null,
  "features": null,
  "floor": null,
  "id": null,
  "name": null,
  "orientation": null,
  "reference": null,
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


