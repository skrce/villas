import { ResponseError } from "../api/generated";
import { SessionChangedError } from "../api/session";
import { OperationRecoveryError } from "../api/bookingActions";
const messages: Record<string, string> = {
  REPORT_TOO_LARGE:
    "This complete report exceeds its source limit. Use a shorter period, or a room filter if the room roster is too large. Coverage and entry limits apply before room filtering. No partial report was returned.",
  REPORT_AMOUNT_LIMIT:
    "The report exceeds the supported exact EUR amount. Narrow its filters.",
  REPORT_SOURCE_INCOMPLETE:
    "Saved report source data is incomplete. Review the booking records before relying on a total.",
  REPORT_CHANGED:
    "Saved records changed since this report was loaded. Refresh the report before downloading.",
  EXPORT_TOO_LARGE:
    "The complete CSV exceeds 5 MiB. Narrow the report filters before downloading.",
  ROOM_NOT_READY:
    "This room must be clean. Finish cleaning and inspection before check-in or an in-house move.",
  READINESS_REVIEW_REQUIRED:
    "Review the destination room's current readiness before confirming.",
  INVALID_STAY_TRANSITION:
    "This action is unavailable for the current stay status. Refresh the stay.",
  STAY_NOT_EDITABLE:
    "This stay is in progress or closed. Use its permitted operating actions or an audited time correction.",
  CHECK_IN_DATE:
    "Check in within the booked dates, before departure day. Accept a date change first if needed.",
  CHECK_OUT_DATE:
    "Accept an early or late departure date change before checkout.",
  NO_SHOW_DATE: "Record a no-show only after the arrival day has passed.",
  SETTLEMENT_REVIEW_REQUIRED:
    "Review and acknowledge the outstanding balance or credit. Checkout records no money automatically.",
  INVALID_OPERATION_TIME:
    "Check the actual times and chosen property offsets. Arrival must fall within the stay; departure must follow it on the agreed departure day, with neither time in the future.",
  ARRIVAL_OUTSIDE_STAY:
    "The new stay dates must contain the actual arrival day.",
  DEPARTURE_DATE_PASSED:
    "Accept a departure-date change that includes the current property day before continuing.",
  QUOTE_CHANGED:
    "The price expired or rates changed. Review the refreshed quote before confirming again.",
  QUOTE_MISMATCH:
    "The saved quote does not match these stay details. Review a new price.",
  QUOTE_ALREADY_ACCEPTED:
    "This quote was already accepted. Review the saved reservation.",
  QUOTE_REQUIRED:
    "Review and accept an accommodation quote before confirming this reservation.",
  PRICE_REVIEW_REQUIRED:
    "This priced stay needs a reviewed change quote before its details can change.",
  RATES_REQUIRED: "Configure this room's nightly rates before quoting a stay.",
  SEASON_OVERLAP:
    "Seasonal price periods overlap. Adjust their start and end dates.",
  INVALID_AMOUNT:
    "Enter a positive EUR amount with at most two decimal places.",
  AMOUNT_TOO_LARGE: "This amount or total exceeds the supported EUR limit.",
  UNSUPPORTED_CURRENCY: "Amounts must use EUR.",
  REFUND_EXCEEDS_RECEIVED:
    "The refund exceeds the money remaining on that receipt. Load the latest balance and review the amount.",
  PAYMENT_UNAVAILABLE:
    "Choose an unreversed receipt for a new refund. You can still check a previous save.",
  PAYMENT_HAS_REFUNDS:
    "Correct the linked refund records before reversing their receipt.",
  ENTRY_ALREADY_REVERSED:
    "This record has already been corrected. Review its linked reversal in the payment history.",
  AGREED_PRICE_REQUIRED:
    "This historical booking has no agreed EUR price. Payment recording is unavailable.",
  FUTURE_PAYMENT:
    "Use the date money was actually received or returned, up to today in Skopje.",
  INVALID_REFERENCE:
    "Use a receipt reference of up to 100 characters without control characters.",
  INVALID_REASON:
    "Enter a reason of up to 500 characters without control characters.",
  REASON_REQUIRED: "Enter a reason before confirming this action.",
  INVALID_METHOD: "Choose cash, an external card payment or a bank transfer.",
  ROOM_OCCUPIED:
    "This room has a checked-in guest. Record departure before changing readiness or using the room.",
  INVALID_READINESS_TRANSITION:
    "Complete cleaning, inspection and clean in order. Reload the current state before confirming.",
  PROPERTY_DATE_CHANGED:
    "The property day changed. Refresh the list before loading more records.",
  INVENTORY_CONFLICT:
    "That room is no longer available for these dates. Choose another room or change the dates.",
  STALE_VERSION:
    "This record changed. Close this dialog and review the latest details before trying again.",
  RESERVATION_CHANGED:
    "This reservation changed. Close this dialog and review the latest details before trying again.",
  LAST_OWNER: "At least one active Owner must remain.",
  STAFF_ALREADY_ACTIVE: "An active Owner already uses that email.",
  CAPACITY_EXCEEDED: "The selected room cannot accommodate this many guests.",
  SESSION_REVOKED: "Your access changed. Sign in again to continue.",
  INVALID_EMAIL: "Enter a valid Google account email.",
  POSSIBLE_DUPLICATE:
    "A guest with this name already exists. Review the matches before creating a separate guest.",
  GUEST_ARCHIVED:
    "This guest is archived. Restore the profile before changing a reservation.",
  GUEST_HAS_BOOKINGS:
    "Cancel the listed current or future reservations before archiving this guest.",
  ROOM_HAS_BOOKINGS:
    "Move or cancel the listed reservations before archiving this room.",
  CAPACITY_CONFLICT:
    "The new capacity is too small for the listed reservations. Review those stays first.",
  ROOM_REFERENCE_EXISTS:
    "This room reference is already in use. Open that room or choose another reference.",
  ROOM_INACTIVE:
    "This room is archived. Restore it before adding a stay or maintenance.",
  INVALID_PHONE:
    "Use digits and an optional international prefix for the phone number.",
  INVALID_GUEST: "Check the guest details and their field lengths.",
};
export const errorMessage = async (error: unknown): Promise<string> => {
  if (error instanceof SessionChangedError) return error.message;
  if (error instanceof OperationRecoveryError) return error.message;
  if (error instanceof ResponseError) {
    const body = await error.response
      .clone()
      .json()
      .catch(() => null);
    if (body && typeof body.code === "string" && messages[body.code])
      return messages[body.code];
    if (error.response.status === 401)
      return "Your session expired. Sign in again, then review your details.";
    if (error.response.status === 403)
      return "This action was denied. Check your session and try again.";
    if (error.response.status === 404)
      return "This record could not be found. Refresh the list.";
    if (error.response.status === 400)
      return "Check the entered details and try again.";
  }
  return "The result could not be confirmed. Check the saved records before retrying.";
};
