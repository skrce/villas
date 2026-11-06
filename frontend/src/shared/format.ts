export const PROPERTY_TIMEZONE = "Europe/Skopje";
export const validDate = (value: string) => {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};
export const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
export const propertyToday = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PROPERTY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};
export const dateLabel = (input?: string | Date | null) => {
  const value =
    input instanceof Date
      ? !Number.isNaN(input.getTime())
        ? input.toISOString().slice(0, 10)
        : undefined
      : input;
  return value && validDate(value)
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${value}T00:00:00Z`))
    : "Date unavailable";
};
export const eventLabel = (value?: Date) =>
  value && !Number.isNaN(value.getTime())
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: PROPERTY_TIMEZONE,
      }).format(value)
    : "Time unavailable";
export const euros = (cents: number) => {
  if (!Number.isSafeInteger(cents)) throw new Error("Invalid money amount.");
  const value = BigInt(cents);
  const absolute = value < 0n ? -value : value;
  const fraction = String(absolute % 100n).padStart(2, "0");
  const parts = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
  }).formatToParts(absolute / 100n);
  return `${value < 0n ? "-" : ""}${parts.map((part) => (part.type === "fraction" ? fraction : part.value)).join("")}`;
};
export const roomLabel = (room: {
  id?: number | null;
  view?: string | null;
  orientation?: string | null;
  name?: string | null;
}) =>
  room.name ||
  [room.view || `Room ${room.id}`, room.orientation]
    .filter(Boolean)
    .join(" · ");
export const validVersion = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export const roomChoiceLabel = (
  room: Parameters<typeof roomLabel>[0] & { reference?: string | null },
) => [roomLabel(room), room.reference].filter(Boolean).join(" · ");
