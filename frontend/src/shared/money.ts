export const MAX_CENTS = 9007199254740991n;
export const validCents = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

export function parseEuroCents(input: string): number | null {
  const value = input.trim();
  if (value.length > 32 || !/^\d+(?:[.,]\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return cents > 0n && cents <= MAX_CENTS ? Number(cents) : null;
}

export function euroInput(cents?: number | null): string {
  if (cents === undefined || cents === null) return "";
  if (!validCents(cents)) throw new Error("The saved price is invalid.");
  const value = BigInt(cents);
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}
