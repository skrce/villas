
# OperationResult


## Properties

Name | Type
------------ | -------------
`inventoryEvent` | [InventoryEventInfo](InventoryEventInfo.md)
`key` | string
`kind` | string
`ledgerEntry` | [LedgerEntryInfo](LedgerEntryInfo.md)
`maintenance` | [MaintenanceBlock](MaintenanceBlock.md)
`readiness` | [ReadinessView](ReadinessView.md)
`readinessEvent` | [ReadinessEventInfo](ReadinessEventInfo.md)
`reservation` | [ReservationInfo](ReservationInfo.md)
`resourceId` | number

## Example

```typescript
import type { OperationResult } from ''

// TODO: Update the object below with actual values
const example = {
  "inventoryEvent": null,
  "key": null,
  "kind": null,
  "ledgerEntry": null,
  "maintenance": null,
  "readiness": null,
  "readinessEvent": null,
  "reservation": null,
  "resourceId": null,
} satisfies OperationResult

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as OperationResult
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


