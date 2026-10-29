import { describe, expect, it } from "vitest";
import { intervalLabel, scheduleReview, type ScheduleState } from "@/lib/domain/scheduling";

const NOW = new Date("2026-10-29T12:00:00Z");
const NEW: ScheduleState = { ease: 2.5, intervalDays: 0, masteryScore: 0 };
const DAY = 24 * 60 * 60 * 1000;

describe("scheduleReview", () => {
  it("schedules a new item", () => {
    expect(scheduleReview(NEW, "again", NOW)).toEqual({
      ease: 2.3,
      intervalDays: 0,
      masteryScore: 0,
      nextReviewAt: new Date(NOW.getTime() + 10 * 60 * 1000),
    });
    expect(scheduleReview(NEW, "hard", NOW)).toMatchObject({
      ease: 2.35,
      intervalDays: 1,
      masteryScore: 0.05,
    });
    expect(scheduleReview(NEW, "good", NOW)).toEqual({
      ease: 2.5,
      intervalDays: 1,
      masteryScore: 0.1,
      nextReviewAt: new Date(NOW.getTime() + DAY),
    });
    expect(scheduleReview(NEW, "easy", NOW)).toMatchObject({
      ease: 2.65,
      intervalDays: 3,
      masteryScore: 0.15,
    });
  });

  it("grows the interval with ease", () => {
    const state = { ease: 2.5, intervalDays: 1, masteryScore: 0.1 };
    expect(scheduleReview(state, "good", NOW).intervalDays).toBe(3);
    expect(scheduleReview(state, "easy", NOW).intervalDays).toBe(4); // always beats "good"
    const later = { ease: 2.5, intervalDays: 10, masteryScore: 0.4 };
    expect(scheduleReview(later, "hard", NOW).intervalDays).toBe(12);
    expect(scheduleReview(later, "good", NOW).intervalDays).toBe(25);
    expect(scheduleReview(later, "easy", NOW).intervalDays).toBe(33); // 10 × 2.5 × 1.3 = 32.5
  });

  it("rounds halves the way Postgres numeric does", () => {
    // In floating point 10 × 1.45 is 14.4999…; numeric gives exactly 14.5 → 15.
    expect(scheduleReview({ ease: 1.45, intervalDays: 10, masteryScore: 0 }, "good", NOW).intervalDays).toBe(
      15,
    );
  });

  it("keeps ease, mastery and interval within bounds", () => {
    expect(scheduleReview({ ease: 1.35, intervalDays: 5, masteryScore: 0.1 }, "again", NOW)).toMatchObject({
      ease: 1.3,
      masteryScore: 0,
    });
    expect(scheduleReview({ ease: 4.95, intervalDays: 300, masteryScore: 0.95 }, "easy", NOW)).toMatchObject({
      ease: 5,
      intervalDays: 365,
      masteryScore: 1,
    });
  });
});

describe("intervalLabel", () => {
  it("describes what each rating would do", () => {
    expect(intervalLabel(NEW, "again")).toBe("10 min");
    expect(intervalLabel(NEW, "good")).toBe("1 day");
    expect(intervalLabel(NEW, "easy")).toBe("3 days");
    expect(intervalLabel({ ease: 2.5, intervalDays: 30, masteryScore: 0.5 }, "good")).toBe("3 mo");
    expect(intervalLabel({ ease: 3, intervalDays: 200, masteryScore: 0.9 }, "good")).toBe("1 yr");
  });
});
