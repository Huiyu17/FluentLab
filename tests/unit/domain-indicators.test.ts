import { describe, expect, it } from "vitest";
import { indicatorTrend } from "@/lib/domain/indicators";

describe("indicatorTrend", () => {
  it("shows only the latest value until there is a review before the last 3", () => {
    expect(indicatorTrend([])).toEqual({ kind: "not_enough", latest: null });
    expect(indicatorTrend([60, 62, 65])).toEqual({ kind: "not_enough", latest: 65 });
  });

  it("compares the last 3 reviews' average with everything before them", () => {
    expect(indicatorTrend([50, 52, 60, 62, 64])).toEqual({
      kind: "up",
      latest: 64,
      recentAverage: 62,
      earlierAverage: 51,
      change: 11,
    });
    expect(indicatorTrend([80, 70, 71, 69])).toMatchObject({ kind: "down", change: -10 });
  });

  it("calls changes under 2 points steady", () => {
    expect(indicatorTrend([70, 71, 70, 72])).toMatchObject({ kind: "steady", change: 1 });
    expect(indicatorTrend([70, 72, 72, 72])).toMatchObject({ kind: "up", change: 2 });
  });
});
