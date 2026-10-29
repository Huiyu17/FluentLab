import { describe, expect, it } from "vitest";
import { MAX_TARGETS, pickTargetItems } from "@/lib/domain/targets";

const NOW = new Date("2026-10-29T12:00:00Z");

function item(id: string, masteryScore: number, nextReviewAt: string) {
  return { id, masteryScore, nextReviewAt };
}

const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe("pickTargetItems", () => {
  it("takes due items first, longest overdue first, then the least mastered", () => {
    const picks = pickTargetItems(
      [
        item("new-later", 0.1, "2026-11-01T00:00:00Z"),
        item("due-recent", 0.6, "2026-10-29T11:00:00Z"),
        item("due-oldest", 0.9, "2026-10-20T00:00:00Z"),
        item("weak-later", 0, "2026-11-03T00:00:00Z"),
      ],
      NOW,
    );
    expect(ids(picks)).toEqual(["due-oldest", "due-recent", "weak-later"]);
  });

  it("caps the picks", () => {
    const many = Array.from({ length: 6 }, (_, i) => item(`i${i}`, 0.1 * i, "2026-11-01T00:00:00Z"));
    expect(pickTargetItems(many, NOW)).toHaveLength(MAX_TARGETS);
    expect(pickTargetItems(many, NOW, 1)).toHaveLength(1);
  });

  it("leaves well-known items to spaced review unless they are due", () => {
    const picks = pickTargetItems(
      [item("known", 0.85, "2026-11-10T00:00:00Z"), item("known-due", 0.95, "2026-10-29T12:00:00Z")],
      NOW,
    );
    expect(ids(picks)).toEqual(["known-due"]);
  });

  it("is deterministic on ties", () => {
    const tied = [item("b", 0.2, "2026-11-01T00:00:00Z"), item("a", 0.2, "2026-11-01T00:00:00Z")];
    expect(ids(pickTargetItems(tied, NOW))).toEqual(["a", "b"]);
    expect(ids(pickTargetItems([...tied].reverse(), NOW))).toEqual(["a", "b"]);
  });

  it("returns nothing for an empty list", () => {
    expect(pickTargetItems([], NOW)).toEqual([]);
  });
});
