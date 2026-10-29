import { describe, expect, it } from "vitest";
import { addDays, dayKey, summarizeStreak } from "@/lib/domain/streak";

const NY = "America/New_York";

describe("dayKey", () => {
  it("uses the learner's time zone", () => {
    const at = new Date("2026-10-28T03:00:00Z");
    expect(dayKey(at, NY)).toBe("2026-10-27");
    expect(dayKey(at, "Asia/Shanghai")).toBe("2026-10-28");
    expect(dayKey(at, "UTC")).toBe("2026-10-28");
  });

  it("falls back to UTC for an unknown time zone", () => {
    expect(dayKey(new Date("2026-10-28T23:30:00Z"), "Mars/Base")).toBe("2026-10-28");
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });
});

describe("summarizeStreak", () => {
  const now = new Date("2026-10-28T20:00:00Z"); // Wed 28 Oct, 4pm in New York

  it("is zero with no activity and still lists the last 7 days", () => {
    const summary = summarizeStreak([], now, NY);
    expect(summary.current).toBe(0);
    expect(summary.practicedToday).toBe(false);
    expect(summary.week.map((d) => d.label)).toEqual(["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"]);
    expect(summary.week.at(-1)).toEqual({ day: "2026-10-28", label: "Wed", practiced: false, isToday: true });
    expect(summary.week.filter((d) => d.isToday)).toHaveLength(1);
  });

  it("counts consecutive days ending today", () => {
    const summary = summarizeStreak(
      ["2026-10-28T14:00:00Z", "2026-10-27T14:00:00Z", "2026-10-26T14:00:00Z", "2026-10-24T14:00:00Z"],
      now,
      NY,
    );
    expect(summary.current).toBe(3);
    expect(summary.practicedToday).toBe(true);
    expect(summary.week.map((d) => d.practiced)).toEqual([false, false, true, false, true, true, true]);
  });

  it("keeps the streak alive when only today is missing", () => {
    const summary = summarizeStreak(["2026-10-27T14:00:00Z", "2026-10-26T14:00:00Z"], now, NY);
    expect(summary.current).toBe(2);
    expect(summary.practicedToday).toBe(false);
  });

  it("resets when yesterday was missed", () => {
    expect(summarizeStreak(["2026-10-26T14:00:00Z"], now, NY).current).toBe(0);
  });

  it("counts several sessions on one day once", () => {
    const summary = summarizeStreak(
      ["2026-10-28T13:00:00Z", "2026-10-28T15:00:00Z", new Date("2026-10-28T16:00:00Z")],
      now,
      NY,
    );
    expect(summary.current).toBe(1);
  });

  it("decides the day in the learner's time zone", () => {
    // 02:00 UTC on the 28th is still the 27th in New York but already the 28th in Shanghai.
    const activity = ["2026-10-28T02:00:00Z"];
    const nowEarly = new Date("2026-10-28T15:00:00Z");
    expect(summarizeStreak(activity, nowEarly, NY)).toMatchObject({ current: 1, practicedToday: false });
    expect(summarizeStreak(activity, nowEarly, "Asia/Shanghai")).toMatchObject({
      current: 1,
      practicedToday: true,
    });
  });

  it("is not thrown off by a daylight saving change", () => {
    // New York leaves DST on 1 Nov 2026; noon local each day.
    const activity = ["2026-10-31T16:00:00Z", "2026-11-01T17:00:00Z", "2026-11-02T17:00:00Z"];
    expect(summarizeStreak(activity, new Date("2026-11-02T23:00:00Z"), NY).current).toBe(3);
  });

  it("ignores invalid timestamps", () => {
    expect(summarizeStreak(["not a date", "2026-10-28T14:00:00Z"], now, NY).current).toBe(1);
  });
});
