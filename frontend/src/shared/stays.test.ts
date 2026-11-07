import { expect, it } from "vitest";
import { localTime, timeOptionsSchema } from "./stays";
it("retains microseconds when converting actual times into the property timezone", () => {
  expect(localTime("2026-11-07T10:00:00.123456Z")).toBe(
    "2026-11-07T11:00:00.123456",
  );
  expect(localTime("2026-07-07T10:00:00.000001Z")).toBe(
    "2026-07-07T12:00:00.000001",
  );
  expect(localTime("invalid")).toBe("");
});
it("retains explicit repeated-time offsets and rejects a third or malformed option", () => {
  const value = {
    timezone: "Europe/Skopje",
    localDateTime: "2026-10-25T02:30",
    options: [
      { utc: "2026-10-25T00:30:00Z", offset: "+02:00" },
      { utc: "2026-10-25T01:30:00Z", offset: "+01:00" },
    ],
  };
  expect(timeOptionsSchema.parse(value).options).toHaveLength(2);
  expect(() =>
    timeOptionsSchema.parse({
      ...value,
      options: [...value.options, value.options[0]],
    }),
  ).toThrow();
  expect(() =>
    timeOptionsSchema.parse({
      ...value,
      options: [{ utc: "invalid", offset: "+01:00" }],
    }),
  ).toThrow();
});
