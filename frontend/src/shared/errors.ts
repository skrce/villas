import { ResponseError } from "../api/generated";
import { SessionChangedError } from "../api/session";
const messages: Record<string, string> = {
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
};
export const errorMessage = async (error: unknown): Promise<string> => {
  if (error instanceof SessionChangedError) return error.message;
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
