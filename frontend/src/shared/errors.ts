import { ResponseError } from "../api/generated";
import { SessionChangedError } from "../api/session";
import { OperationRecoveryError } from "../api/bookingActions";
const messages: Record<string, string> = {
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
  AMOUNT_TOO_LARGE: "This accommodation total exceeds the supported amount.",
  UNSUPPORTED_CURRENCY: "Room prices must use EUR.",
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
