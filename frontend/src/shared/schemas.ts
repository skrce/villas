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
  phone: z
    .string()
    .trim()
    .max(200)
    .refine(
      (value) =>
        !value ||
        (!/\p{Cc}/u.test(value) &&
          /^\+?[0-9]{1,20}$/.test(
            value.replace(/[\p{Z}\s().-]/gu, "").replace(/^00/, "+"),
          )),
      "Use digits and an optional international prefix.",
    ),
  email: z
    .string()
    .trim()
    .max(254)
    .refine(
      (value) => !value || z.email().safeParse(value).success,
      "Enter a valid email address.",
    ),
  address: z.string().trim().max(500, "Use at most 500 characters."),
  notes: z.string().trim().max(2000, "Use at most 2000 characters."),
});
export const guestSearchSchema = z.object({
  name: z.string().trim().max(200),
  phone: guestSchema.shape.phone,
  includeArchived: z.boolean(),
});
export const roomSchema = z.object({
  name: text,
  reference: z
    .string()
    .trim()
    .min(1, "This field is required.")
    .max(32)
    .regex(/^[a-z0-9][a-z0-9-]*$/i, "Use letters, digits and hyphens."),
  capacity: z.number().int("Use a whole number.").min(1).max(1000),
  orientation: z.string().trim().max(200),
  view: z.string().trim().max(200),
  bedConfiguration: z.string().trim().max(200),
  features: z.string().trim().max(1000),
  floor: z.string().trim().max(50),
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
export const maintenanceSchema = z
  .object({ startDate: dateSchema, endDate: dateSchema, reason: text })
  .refine((data) => data.endDate > data.startDate, {
    path: ["endDate"],
    message: "End date must be after start date.",
  });
export const inviteSchema = z.object({
  email: z.email("Enter a valid email address.").max(254),
});
