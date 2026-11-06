import { z } from "zod";
import { validDate } from "./format";
const text = z
  .string()
  .trim()
  .min(1, "This field is required.")
  .max(200, "Use at most 200 characters.");
export const guestSchema = z.object({
  firstName: text,
  lastName: text,
  phone: text,
  address: text,
});
export const guestSearchSchema = z
  .object({
    firstName: z.string().trim().max(200),
    phone: z.string().trim().max(200),
  })
  .refine((data) => !!(data.firstName || data.phone), {
    path: ["firstName"],
    message: "Enter a first name or phone number.",
  });
export const dateSchema = z
  .string()
  .refine(validDate, "Enter a complete, valid date.");
export const staySchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
    guestCount: z.number().int().min(1).max(1000),
  })
  .refine((data) => data.endDate > data.startDate, {
    path: ["endDate"],
    message: "Check-out must be after check-in.",
  });
export const bookingSchema = staySchema.safeExtend({
  customerId: z.string().regex(/^[1-9]\d*$/, "Choose a guest."),
  guestLabel: z.string(),
  roomId: z.string().regex(/^[1-9]\d*$/, "Choose an available room."),
});
export const inviteSchema = z.object({
  email: z.email("Enter a valid email address.").max(254),
});
