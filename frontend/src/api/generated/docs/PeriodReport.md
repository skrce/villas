
# PeriodReport


## Properties

Name | Type
------------ | -------------
`balances` | [Array&lt;BalanceRow&gt;](BalanceRow.md)
`charges` | [Array&lt;ChargeRow&gt;](ChargeRow.md)
`collections` | [Array&lt;CollectionRow&gt;](CollectionRow.md)
`endDate` | string
`kind` | string
`notices` | Array&lt;string&gt;
`occupancy` | [Array&lt;OccupancyRow&gt;](OccupancyRow.md)
`propertyDate` | string
`roomId` | number
`snapshotId` | string
`startDate` | string
`totals` | [ReportTotals](ReportTotals.md)

## Example

```typescript
import type { PeriodReport } from ''

// TODO: Update the object below with actual values
const example = {
  "balances": null,
  "charges": null,
  "collections": null,
  "endDate": null,
  "kind": null,
  "notices": null,
  "occupancy": null,
  "propertyDate": null,
  "roomId": null,
  "snapshotId": null,
  "startDate": null,
  "totals": null,
} satisfies PeriodReport

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PeriodReport
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


