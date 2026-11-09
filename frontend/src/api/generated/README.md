# Villas generated API client

This client is bundled with the Villas frontend. Regenerate it from the backend
contract with `npm run generate:api`; do not edit generated files.

Use the session-aware clients in `frontend/src/api/client.ts`. Browser requests use
same-origin credentials. Unsafe requests also require the current CSRF header.
Never read, copy or configure the HttpOnly session cookie as a JavaScript API key.
Business-scoped staff operations require an explicit authorized `businessId`.

## API endpoints

| Class | Method | HTTP request | Description |
| --- | --- | --- | --- |
| ApartmentApi | [apartmentDirectory](docs/ApartmentApi.md#apartmentdirectory) | GET /apartments/directory | Read a bounded room directory by name or reference |
| ApartmentApi | [blockApartment](docs/ApartmentApi.md#blockapartment) | POST /apartments/{apartmentId}/maintenance | Add a dated maintenance block using a private JSON body |
| ApartmentApi | [createApartment](docs/ApartmentApi.md#createapartment) | POST /apartments | Add a named room with a unique property reference |
| ApartmentApi | [getApartment](docs/ApartmentApi.md#getapartment) | GET /apartments/{apartmentId} | Read a property-scoped current or archived room |
| ApartmentApi | [listApartments](docs/ApartmentApi.md#listapartments) | GET /apartments | List rooms for compatibility and booking selectors |
| ApartmentApi | [setApartmentStatus](docs/ApartmentApi.md#setapartmentstatus) | POST /apartments/{apartmentId}/status | Archive or restore a room while retaining its history |
| ApartmentApi | [updateApartment](docs/ApartmentApi.md#updateapartment) | PUT /apartments/{apartmentId} | Edit a reviewed room without invalidating current or future stays |
| BusinessStaffApi | [businessStaff](docs/BusinessStaffApi.md#businessstaff) | GET /businesses/{businessId}/staff | Read Owner memberships in an explicitly authorized business |
| BusinessStaffApi | [businessStaffInvitations](docs/BusinessStaffApi.md#businessstaffinvitations) | GET /businesses/{businessId}/staff/invitations | Read invitations in an explicitly authorized business |
| BusinessStaffApi | [deactivateBusinessOwner](docs/BusinessStaffApi.md#deactivatebusinessowner) | POST /businesses/{businessId}/staff/{staffId}/deactivate | Deactivate an Owner membership in one business |
| BusinessStaffApi | [inviteBusinessOwner](docs/BusinessStaffApi.md#invitebusinessowner) | POST /businesses/{businessId}/staff/invitations | Invite an Owner to an explicitly authorized business |
| BusinessStaffApi | [revokeBusinessInvitation](docs/BusinessStaffApi.md#revokebusinessinvitation) | DELETE /businesses/{businessId}/staff/invitations/{invitationId} | Revoke an invitation in an explicitly authorized business |
| BusinessStaffApi | [revokeBusinessSessions](docs/BusinessStaffApi.md#revokebusinesssessions) | POST /businesses/{businessId}/staff/{staffId}/revoke-sessions | Revoke existing session grants for one business membership |
| CalendarApi | [bookingCalendar](docs/CalendarApi.md#bookingcalendar) | GET /calendar | Read a bounded consistent room calendar of active stays and maintenance |
| CustomerApi | [createCustomer](docs/CustomerApi.md#createcustomer) | POST /customers | Create a guest using a private JSON body |
| CustomerApi | [customerDuplicates](docs/CustomerApi.md#customerduplicates) | POST /customers/duplicates | Review possible guest matches without merging identities |
| CustomerApi | [customerReservations](docs/CustomerApi.md#customerreservations) | GET /customers/{customerId}/reservations | Read a bounded guest history including retained cancellations |
| CustomerApi | [getCustomer](docs/CustomerApi.md#getcustomer) | GET /customers/{customerId} | Read a property-scoped guest |
| CustomerApi | [queryCustomers](docs/CustomerApi.md#querycustomers) | POST /customers/query | List or search guests with private combined criteria and a bounded cursor |
| CustomerApi | [searchCustomer](docs/CustomerApi.md#searchcustomer) | POST /customers/search | Search guests without putting contact criteria in a URL |
| CustomerApi | [setCustomerStatus](docs/CustomerApi.md#setcustomerstatus) | POST /customers/{customerId}/status | Archive or restore a guest without deleting history |
| CustomerApi | [updateCustomer](docs/CustomerApi.md#updatecustomer) | PUT /customers/{customerId} | Replace a guest profile using the reviewed version |
| InventoryApi | [listMaintenanceBlocks](docs/InventoryApi.md#listmaintenanceblocks) | GET /maintenance-blocks | Read a bounded maintenance calendar page |
| InventoryApi | [listReservations](docs/InventoryApi.md#listreservations) | GET /reservations | Read a bounded overlapping-stay calendar page |
| InventoryApi | [maintenanceHistory](docs/InventoryApi.md#maintenancehistory) | GET /maintenance-blocks/{blockId}/events | Read a bounded maintenance event page |
| InventoryApi | [reservationHistory](docs/InventoryApi.md#reservationhistory) | GET /reservations/{reservationId}/events | Read a bounded reservation event page |
| MaintenanceApi | [cancelMaintenanceBlock](docs/MaintenanceApi.md#cancelmaintenanceblock) | DELETE /maintenance-blocks/{blockId} | Retain a block cancellation and release inventory |
| MaintenanceApi | [createMaintenanceBlock](docs/MaintenanceApi.md#createmaintenanceblock) | POST /maintenance-blocks | Block a room only if no active inventory overlaps |
| OperationsApi | [cancelStay](docs/OperationsApi.md#cancelstay) | POST /reservations/{id}/cancel | Record a reasoned cancellation without an automatic refund |
| OperationsApi | [changeRoomReadiness](docs/OperationsApi.md#changeroomreadiness) | POST /apartments/{roomId}/readiness | Record a reviewed room-readiness transition |
| OperationsApi | [changeStay](docs/OperationsApi.md#changestay) | POST /reservations/{id}/change | Accept a new whole-stay quote and change reviewed dates or party size |
| OperationsApi | [checkInStay](docs/OperationsApi.md#checkinstay) | POST /reservations/{id}/check-in | Record arrival within the booked dates into a reviewed clean room |
| OperationsApi | [checkOutStay](docs/OperationsApi.md#checkoutstay) | POST /reservations/{id}/check-out | Record departure and mark its room dirty in one transaction |
| OperationsApi | [correctStayTimes](docs/OperationsApi.md#correctstaytimes) | POST /reservations/{id}/actual-times | Correct actual arrival/departure times with a retained Owner reason |
| OperationsApi | [frontDesk](docs/OperationsApi.md#frontdesk) | GET /front-desk | Read bounded arrival, departure, in-house and attention lists for the property day |
| OperationsApi | [housekeeping](docs/OperationsApi.md#housekeeping) | GET /housekeeping | Read room readiness, physical occupancy and dated maintenance without guest or financial data |
| OperationsApi | [moveStay](docs/OperationsApi.md#movestay) | POST /reservations/{id}/move | Accept a new whole-stay quote and move a confirmed or in-house stay |
| OperationsApi | [propertyTimeOptions](docs/OperationsApi.md#propertytimeoptions) | POST /property-time/options | Resolve a Skopje time to explicit UTC choices, including repeated or missing daylight-saving times |
| OperationsApi | [recordNoShow](docs/OperationsApi.md#recordnoshow) | POST /reservations/{id}/no-show | Record a reasoned no-show after the arrival day |
| OperationsApi | [reservationAllocations](docs/OperationsApi.md#reservationallocations) | GET /reservations/{id}/allocations | Read versioned dated room allocations without changing the whole-stay price |
| OperationsApi | [roomReadiness](docs/OperationsApi.md#roomreadiness) | GET /apartments/{roomId}/readiness | Read current room readiness without guest or financial data |
| OperationsApi | [roomReadinessHistory](docs/OperationsApi.md#roomreadinesshistory) | GET /apartments/{roomId}/readiness/events | Read bounded room-readiness history |
| PaymentsApi | [recordPayment](docs/PaymentsApi.md#recordpayment) | POST /reservations/{id}/ledger/payments | Record a payment already completed outside Villas |
| PaymentsApi | [recordRefund](docs/PaymentsApi.md#recordrefund) | POST /reservations/{id}/ledger/refunds | Record an externally completed refund against one receipt |
| PaymentsApi | [refundablePayments](docs/PaymentsApi.md#refundablepayments) | GET /reservations/{id}/ledger/payments | Read receipt allocations available for manual refund |
| PaymentsApi | [reservationLedger](docs/PaymentsApi.md#reservationledger) | GET /reservations/{id}/ledger | Read agreed accommodation and externally received funds |
| PaymentsApi | [reservationLedgerHistory](docs/PaymentsApi.md#reservationledgerhistory) | GET /reservations/{id}/ledger/entries | Read immutable payment, refund and correction history |
| PaymentsApi | [reverseLedgerEntry](docs/PaymentsApi.md#reverseledgerentry) | POST /reservations/{id}/ledger/entries/{entryId}/reversal | Retain and correct a mistaken payment or refund with a reason |
| QuotesApi | [changeReservationWithQuote](docs/QuotesApi.md#changereservationwithquote) | PATCH /reservations/{reservationId}/dates/quoted | Accept a new whole-stay price and change dates or party size atomically |
| QuotesApi | [confirmReservationQuote](docs/QuotesApi.md#confirmreservationquote) | POST /reservations/quoted | Accept a saved quote and atomically create its priced reservation with a stable operation key |
| QuotesApi | [createBookingQuote](docs/QuotesApi.md#createbookingquote) | POST /booking-quotes | Save an Owner-scoped EUR accommodation quote without holding inventory |
| QuotesApi | [getBookingQuote](docs/QuotesApi.md#getbookingquote) | GET /booking-quotes/{quoteId} | Read this Owner\&#39;s saved historical quote |
| QuotesApi | [moveReservationWithQuote](docs/QuotesApi.md#movereservationwithquote) | PATCH /reservations/{reservationId}/room/quoted | Accept a new whole-stay price and move the reservation atomically |
| QuotesApi | [reservationPrice](docs/QuotesApi.md#reservationprice) | GET /reservations/{reservationId}/price | Read the accepted price or explicit unrecorded historical state |
| QuotesApi | [reservationPriceHistory](docs/QuotesApi.md#reservationpricehistory) | GET /reservations/{reservationId}/prices | Read bounded immutable accepted price history |
| RatesApi | [previewRoomRates](docs/RatesApi.md#previewroomrates) | POST /apartments/{apartmentId}/rates/preview | Explain the accommodation price without reserving inventory or accepting a quote |
| RatesApi | [roomRates](docs/RatesApi.md#roomrates) | GET /apartments/{apartmentId}/rates | Read configured EUR rates or an explicit unconfigured state |
| RatesApi | [updateRoomRates](docs/RatesApi.md#updateroomrates) | PUT /apartments/{apartmentId}/rates | Replace a reviewed room\&#39;s base and non-overlapping seasonal rates |
| ReportsApi | [exportReport](docs/ReportsApi.md#exportreport) | GET /reports/export | Download a bounded UTF-8 CSV only when its source snapshot still matches the reviewed report |
| ReportsApi | [readPeriodReport](docs/ReportsApi.md#readperiodreport) | GET /reports | Read a complete bounded report with definitions and source drill-downs |
| ReportsApi | [today](docs/ReportsApi.md#today) | GET /today | Read a consistent Owner-only snapshot of today\&#39;s work and current balance attention |
| ReservationApi | [cancelReservation](docs/ReservationApi.md#cancelreservation) | DELETE /reservations | Retain a cancellation and release inventory |
| ReservationApi | [changeReservationDates](docs/ReservationApi.md#changereservationdates) | PATCH /reservations/{reservationId}/dates | Change stay dates and guest count |
| ReservationApi | [createReservation](docs/ReservationApi.md#createreservation) | POST /reservations | Create a reservation with an accepted quote and stable operation key |
| ReservationApi | [findAvailableApartments](docs/ReservationApi.md#findavailableapartments) | GET /reservations/available-apartments | Read advisory availability using the write-side overlap rules |
| ReservationApi | [findReservationsByCustomer](docs/ReservationApi.md#findreservationsbycustomer) | GET /reservations/customer | Read active reservations for a guest |
| ReservationApi | [getOperation](docs/ReservationApi.md#getoperation) | GET /operations/{operationKey} | Reconcile a write using its stable operation key |
| ReservationApi | [getReservation](docs/ReservationApi.md#getreservation) | GET /reservations/{reservationId} | Read the current reservation, including its version |
| ReservationApi | [updateReservationRoom](docs/ReservationApi.md#updatereservationroom) | PATCH /reservations | Move a reservation using its expected version |
| StaffApi | [deactivateStaff](docs/StaffApi.md#deactivatestaff) | POST /staff/{staffId}/deactivate | Deactivate an Owner while retaining the last active Owner |
| StaffApi | [inviteOwner](docs/StaffApi.md#inviteowneroperation) | POST /staff/invitations | Invite a Google account as an Owner |
| StaffApi | [listStaff](docs/StaffApi.md#liststaff) | GET /staff | Read Owner accounts |
| StaffApi | [listStaffInvitations](docs/StaffApi.md#liststaffinvitations) | GET /staff/invitations | Read unexpired Owner invitations |
| StaffApi | [logoutStaff](docs/StaffApi.md#logoutstaff) | POST /auth/logout | Invalidate the current staff session |
| StaffApi | [myBusinessMemberships](docs/StaffApi.md#mybusinessmemberships) | GET /auth/memberships | Read only the caller\&#39;s current authorized business memberships |
| StaffApi | [revokeStaffInvitation](docs/StaffApi.md#revokestaffinvitation) | DELETE /staff/invitations/{invitationId} | Revoke an unclaimed invitation |
| StaffApi | [revokeStaffSessions](docs/StaffApi.md#revokestaffsessions) | POST /staff/{staffId}/revoke-sessions | Invalidate every current session for an Owner |
| StaffApi | [staffSession](docs/StaffApi.md#staffsession) | GET /auth/session | Read the current server-side staff session |


## Models

- [AcceptedPrice](docs/AcceptedPrice.md)
- [ActualTimesRequest](docs/ActualTimesRequest.md)
- [Apartment](docs/Apartment.md)
- [BalanceRow](docs/BalanceRow.md)
- [BookingCalendarPage](docs/BookingCalendarPage.md)
- [BookingQuote](docs/BookingQuote.md)
- [BusinessMembershipView](docs/BusinessMembershipView.md)
- [CalendarMaintenance](docs/CalendarMaintenance.md)
- [CalendarRoom](docs/CalendarRoom.md)
- [CalendarStay](docs/CalendarStay.md)
- [ChargeRow](docs/ChargeRow.md)
- [CheckInRequest](docs/CheckInRequest.md)
- [CheckOutRequest](docs/CheckOutRequest.md)
- [CollectionRow](docs/CollectionRow.md)
- [Customer](docs/Customer.md)
- [CustomerCreateRequest](docs/CustomerCreateRequest.md)
- [CustomerSearchRequest](docs/CustomerSearchRequest.md)
- [ErrorResponse](docs/ErrorResponse.md)
- [FrontDeskPage](docs/FrontDeskPage.md)
- [FrontDeskStay](docs/FrontDeskStay.md)
- [GuestPage](docs/GuestPage.md)
- [GuestQueryRequest](docs/GuestQueryRequest.md)
- [GuestUpdateRequest](docs/GuestUpdateRequest.md)
- [HousekeepingPage](docs/HousekeepingPage.md)
- [HousekeepingRoom](docs/HousekeepingRoom.md)
- [IdentityView](docs/IdentityView.md)
- [InventoryEventInfo](docs/InventoryEventInfo.md)
- [InventoryEventPage](docs/InventoryEventPage.md)
- [InvitationView](docs/InvitationView.md)
- [InviteOwnerRequest](docs/InviteOwnerRequest.md)
- [LedgerEntryInfo](docs/LedgerEntryInfo.md)
- [LedgerHistory](docs/LedgerHistory.md)
- [LedgerSummary](docs/LedgerSummary.md)
- [LedgerTotals](docs/LedgerTotals.md)
- [MaintenanceBlock](docs/MaintenanceBlock.md)
- [MaintenancePage](docs/MaintenancePage.md)
- [OccupancyRow](docs/OccupancyRow.md)
- [OperationResult](docs/OperationResult.md)
- [OperationalChangeRequest](docs/OperationalChangeRequest.md)
- [OperationalMoveRequest](docs/OperationalMoveRequest.md)
- [PaymentRequest](docs/PaymentRequest.md)
- [PeriodReport](docs/PeriodReport.md)
- [PriceHistory](docs/PriceHistory.md)
- [PriceLine](docs/PriceLine.md)
- [PropertyTimeOption](docs/PropertyTimeOption.md)
- [PropertyTimeOptions](docs/PropertyTimeOptions.md)
- [PropertyTimeRequest](docs/PropertyTimeRequest.md)
- [QuoteConfirmationRequest](docs/QuoteConfirmationRequest.md)
- [QuoteRequest](docs/QuoteRequest.md)
- [QuotedRoomChange](docs/QuotedRoomChange.md)
- [QuotedStayChange](docs/QuotedStayChange.md)
- [RatePreviewRequest](docs/RatePreviewRequest.md)
- [RateUpdateRequest](docs/RateUpdateRequest.md)
- [ReadinessChangeRequest](docs/ReadinessChangeRequest.md)
- [ReadinessEventInfo](docs/ReadinessEventInfo.md)
- [ReadinessHistory](docs/ReadinessHistory.md)
- [ReadinessView](docs/ReadinessView.md)
- [RecordStatusRequest](docs/RecordStatusRequest.md)
- [RefundRequest](docs/RefundRequest.md)
- [RefundablePayment](docs/RefundablePayment.md)
- [RefundablePayments](docs/RefundablePayments.md)
- [ReportTotals](docs/ReportTotals.md)
- [ReservationInfo](docs/ReservationInfo.md)
- [ReservationPage](docs/ReservationPage.md)
- [ReservationPriceView](docs/ReservationPriceView.md)
- [ReversalRequest](docs/ReversalRequest.md)
- [RoomAllocationInfo](docs/RoomAllocationInfo.md)
- [RoomAllocationPage](docs/RoomAllocationPage.md)
- [RoomBlockRequest](docs/RoomBlockRequest.md)
- [RoomCreateRequest](docs/RoomCreateRequest.md)
- [RoomPage](docs/RoomPage.md)
- [RoomRates](docs/RoomRates.md)
- [RoomUpdateRequest](docs/RoomUpdateRequest.md)
- [SeasonRate](docs/SeasonRate.md)
- [SeasonRateRequest](docs/SeasonRateRequest.md)
- [SessionView](docs/SessionView.md)
- [StaffVersionRequest](docs/StaffVersionRequest.md)
- [StaffView](docs/StaffView.md)
- [StayPrice](docs/StayPrice.md)
- [StayReasonRequest](docs/StayReasonRequest.md)
- [TodayBalances](docs/TodayBalances.md)
- [TodayQueue](docs/TodayQueue.md)
- [TodayView](docs/TodayView.md)


## Authorization

<a id="staffSession"></a>
### staffSession

HttpOnly, host-scoped session cookie. Local HTTP uses VILLAS_LOCAL_SESSION. Browser requests use same-origin credentials; never read or copy this cookie in JavaScript.
