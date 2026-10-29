import { describe, expect, it } from "vitest";
import { daysBetween, futureDay, greeting, longDate, pastDay } from "@/lib/dates";

const NY = "America/New_York";
const NOW = new Date("2026-10-28T20:00:00Z"); // Wed 28 Oct, 4pm in New York

describe("dates", () => {
  it("counts calendar days", () => {
    expect(daysBetween("2026-10-28", "2026-10-28")).toBe(0);
    expect(daysBetween("2026-10-28", "2026-11-02")).toBe(5);
    expect(daysBetween("2026-11-02", "2026-10-28")).toBe(-5);
  });

  it("greets by the learner's local hour", () => {
    expect(greeting(new Date("2026-10-28T13:00:00Z"), NY)).toBe("Good morning");
    expect(greeting(NOW, NY)).toBe("Good afternoon");
    expect(greeting(NOW, "Asia/Shanghai")).toBe("Good evening"); // 4am next day
    expect(greeting(new Date("2026-10-28T23:30:00Z"), NY)).toBe("Good evening");
  });

  it("formats today's date in the learner's time zone", () => {
    expect(longDate(NOW, NY)).toBe("Wednesday, October 28");
    expect(longDate(NOW, "Asia/Shanghai")).toBe("Thursday, October 29");
    expect(longDate(NOW, "Mars/Base")).toBe("Wednesday, October 28");
  });

  it("describes past days", () => {
    expect(pastDay("2026-10-28T13:00:00Z", NOW, NY)).toBe("Today");
    expect(pastDay("2026-10-28T02:00:00Z", NOW, NY)).toBe("Yesterday"); // 10pm on the 27th locally
    expect(pastDay("2026-10-24T15:00:00Z", NOW, NY)).toBe("Saturday");
    expect(pastDay("2026-10-12T15:00:00Z", NOW, NY)).toBe("Oct 12");
    expect(pastDay("2025-12-30T15:00:00Z", NOW, NY)).toBe("Dec 30, 2025");
  });

  it("describes future days", () => {
    expect(futureDay("2026-10-28T23:00:00Z", NOW, NY)).toBe("later today");
    expect(futureDay("2026-10-29T13:00:00Z", NOW, NY)).toBe("tomorrow");
    expect(futureDay("2026-10-30T13:00:00Z", NOW, NY)).toBe("on Friday");
    expect(futureDay("2026-11-12T13:00:00Z", NOW, NY)).toBe("on Nov 12");
  });
});
