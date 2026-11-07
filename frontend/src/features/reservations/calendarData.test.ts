import { describe, expect, it } from "vitest";
import {
  agendaGaps,
  bookingSeed,
  confirmedCalendar,
  freePeriod,
  positiveId,
} from "./calendarData";
const room = {
  id: 7,
  name: "Lake",
  reference: "LAKE",
  active: true,
  capacity: 4,
};
export const calendarFixture = () => ({
  startDate: "2030-01-01",
  endDate: "2030-01-08",
  rooms: [room],
  nextRoomCursor: null,
  stays: [
    {
      id: 3,
      roomId: 7,
      customerId: 5,
      guestName: "Synthetic Guest",
      startDate: "2029-12-30",
      endDate: "2030-01-03",
      guestCount: 2,
      version: 0,
      status: "ACTIVE" as const,
    },
  ],
  maintenance: [
    {
      id: 8,
      roomId: 7,
      startDate: "2030-01-05",
      endDate: "2030-01-06",
      reason: "Repair",
      version: 0,
      status: "ACTIVE" as const,
    },
  ],
});
const confirm = (value: unknown) =>
  confirmedCalendar(value, "2030-01-01", "2030-01-08", 0, 20, false);
describe("complete calendar snapshots", () => {
  it("clips occupied periods and offers only half-open free gaps", () => {
    const data = confirm(calendarFixture());
    expect(agendaGaps(data, 7)).toEqual([
      { from: "2030-01-03", to: "2030-01-05" },
      { from: "2030-01-06", to: "2030-01-08" },
    ]);
    expect(freePeriod(data, 7, "2030-01-03", "2030-01-05")).toBe(true);
    expect(freePeriod(data, 7, "2030-01-03", "2030-01-06")).toBe(false);
    expect(freePeriod(data, 7, "2029-12-31", "2030-01-01")).toBe(false);
    expect(freePeriod(data, 9, "2030-01-03", "2030-01-05")).toBe(false);
  });
  it.each([
    (d: ReturnType<typeof calendarFixture>) => ({ ...d, stays: undefined }),
    (d: ReturnType<typeof calendarFixture>) => ({
      ...d,
      endDate: "2030-01-09",
    }),
    (d: ReturnType<typeof calendarFixture>) => ({
      ...d,
      rooms: [...d.rooms, room],
    }),
    (d: ReturnType<typeof calendarFixture>) => ({ ...d, nextRoomCursor: 7 }),
    (d: ReturnType<typeof calendarFixture>) => ({
      ...d,
      stays: [...d.stays, d.stays[0]],
    }),
    (d: ReturnType<typeof calendarFixture>) => ({
      ...d,
      stays: [{ ...d.stays[0], roomId: 9 }],
    }),
    (d: ReturnType<typeof calendarFixture>) => ({
      ...d,
      stays: [{ ...d.stays[0], endDate: "2030-01-01" }],
    }),
    (d: ReturnType<typeof calendarFixture>) => ({
      ...d,
      maintenance: [{ ...d.maintenance[0], startDate: "2030-01-02" }],
    }),
    (d: ReturnType<typeof calendarFixture>) => ({
      ...d,
      rooms: [{ ...room, active: false }],
    }),
  ])(
    "rejects malformed or overlapping snapshots instead of inventing availability (%#)",
    (change) => expect(() => confirm(change(calendarFixture()))).toThrow(),
  );
  it("bounds identifiers and rejects ambiguous calendar seeds", () => {
    for (const value of ["0", "-1", "01", "1.5", "2147483648", "NaN"])
      expect(positiveId(value)).toBe(false);
    const today = "2030-01-01";
    for (const query of [
      "from=2030-01-01",
      "from=2030-02-30&to=2030-03-02",
      "from=2030-01-03&to=2030-01-01",
      "room=-1",
      "guest=hello",
    ])
      expect(bookingSeed(new URLSearchParams(query), today).valid).toBe(false);
    const first = bookingSeed(
      new URLSearchParams("guest=5&room=7&from=2030-01-03&to=2030-01-05"),
      today,
    );
    const second = bookingSeed(
      new URLSearchParams("guest=5&room=8&from=2030-01-03&to=2030-01-05"),
      today,
    );
    expect(first).toMatchObject({
      valid: true,
      guestId: 5,
      roomId: "7",
      startDate: "2030-01-03",
      endDate: "2030-01-05",
    });
    expect(first.key).not.toBe(second.key);
    expect(bookingSeed(new URLSearchParams("guest=5"), today).key).toBe(
      "reservation-create-guest-5",
    );
  });
  it("keeps dated allocations of one in-house stay in separate rooms", () => {
    const fixture = calendarFixture();
    const moved = {
      ...fixture,
      rooms: [room, { ...room, id: 8, reference: "GARDEN" }],
      stays: [
        {
          ...fixture.stays[0],
          allocationId: "allocation:21",
          phase: "CHECKED_IN",
          endDate: "2030-01-02",
        },
        {
          ...fixture.stays[0],
          allocationId: "allocation:22",
          phase: "CHECKED_IN",
          roomId: 8,
          startDate: "2030-01-02",
        },
      ],
    };
    const data = confirm(moved);
    expect(data.stays).toHaveLength(2);
    expect(freePeriod(data, 7, "2030-01-02", "2030-01-05")).toBe(true);
    expect(freePeriod(data, 8, "2030-01-02", "2030-01-03")).toBe(false);
    expect(() =>
      confirm({
        ...moved,
        stays: moved.stays.map((stay, index) => ({ ...stay, version: index })),
      }),
    ).toThrow(/inconsistent/);
    expect(() =>
      confirm({
        ...moved,
        stays: moved.stays.map((stay) => ({
          ...stay,
          allocationId: "allocation:21",
        })),
      }),
    ).toThrow(/duplicate/);
    expect(() =>
      confirm({
        ...moved,
        stays: [moved.stays[0], { ...moved.stays[1], startDate: "2030-01-01" }],
      }),
    ).toThrow(/inconsistent/);
  });
});
