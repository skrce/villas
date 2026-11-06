
# RoomCreateRequest


## Properties

Name | Type
------------ | -------------
`bedConfiguration` | string
`capacity` | number
`features` | string
`floor` | string
`name` | string
`orientation` | string
`reference` | string
`view` | string

## Example

```typescript
import type { RoomCreateRequest } from ''

// TODO: Update the object below with actual values
const example = {
  "bedConfiguration": null,
  "capacity": null,
  "features": null,
  "floor": null,
  "name": null,
  "orientation": null,
  "reference": null,
  "view": null,
} satisfies RoomCreateRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as RoomCreateRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


