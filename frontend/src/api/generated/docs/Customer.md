
# Customer


## Properties

Name | Type
------------ | -------------
`active` | boolean
`address` | string
`email` | string
`firstName` | string
`id` | number
`lastName` | string
`notes` | string
`phone` | string
`version` | number

## Example

```typescript
import type { Customer } from ''

// TODO: Update the object below with actual values
const example = {
  "active": null,
  "address": null,
  "email": null,
  "firstName": null,
  "id": null,
  "lastName": null,
  "notes": null,
  "phone": null,
  "version": null,
} satisfies Customer

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as Customer
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


