import { createContext, useContext } from "react";
import type { buildApis } from "../api/client";
import type { buildBookingActions } from "../api/bookingActions";
export type Workspace = {
  apis: ReturnType<typeof buildApis>;
  booking: ReturnType<typeof buildBookingActions>;
  epoch: number;
  ownerId: string;
};
export const WorkspaceContext = createContext<Workspace | null>(null);
export const DraftContext = createContext<Map<string, unknown> | null>(null);
export const useWorkspace = () => {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace context missing.");
  return value;
};
