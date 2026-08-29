import { assertPolicy, rankAlternatives, rankWaitlist } from "./business";

describe("business rules", () => {
  it("ranks alternatives by same sport/time, same facility, then similar within one hour", () => {
    const t = new Date("2026-08-29T18:00:00.000Z");
    const ranked = rankAlternatives(
      { id: "requested", facilityId: "court-1", sport: "Badminton", startsAt: t },
      [
        { id: "same-facility", facilityId: "court-1", sport: "Badminton", startsAt: new Date("2026-08-29T19:00:00.000Z") },
        { id: "same-time", facilityId: "court-2", sport: "Badminton", startsAt: t },
        { id: "similar", facilityId: "court-3", sport: "Badminton", startsAt: new Date("2026-08-29T17:00:00.000Z") }
      ]
    );
    expect(ranked.map((x) => x.slot.id)).toEqual(["same-time", "same-facility", "similar"]);
  });

  it("rejects policy violations with clear codes", () => {
    expect(assertPolicy({ active: 3, weeklySport: 0, maxActive: 3, maxWeekly: 3 })).toEqual({ ok: false, code: "MAX_ACTIVE_BOOKINGS" });
    expect(assertPolicy({ active: 1, weeklySport: 3, maxActive: 3, maxWeekly: 3 })).toEqual({ ok: false, code: "WEEKLY_LIMIT" });
    expect(assertPolicy({ active: 1, weeklySport: 1, maxActive: 3, maxWeekly: 3 })).toEqual({ ok: true, code: "OK" });
  });

  it("keeps waitlist FIFO unless priority is configured", () => {
    const older = { createdAt: new Date("2026-08-29T10:00:00Z"), priority: 0 };
    const newerPriority = { createdAt: new Date("2026-08-29T10:05:00Z"), priority: 1 };
    const newest = { createdAt: new Date("2026-08-29T10:10:00Z"), priority: 0 };
    expect(rankWaitlist([newest, older]).map((x) => x.createdAt)).toEqual([older.createdAt, newest.createdAt]);
    expect(rankWaitlist([older, newest, newerPriority])[0]).toBe(newerPriority);
  });
});
