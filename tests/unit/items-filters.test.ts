import { describe, expect, it } from "vitest";
import { filterItems, isDue, itemFiltersQuery, itemHref, parseItemFilters, type ItemType } from "@/lib/items";

const NOW = new Date("2026-10-29T12:00:00Z");

function item(id: string, type: ItemType, nextReviewAt: string) {
  return { id, type, nextReviewAt };
}

const ITEMS = [
  item("w-due", "word", "2026-10-29T11:59:00Z"),
  item("w-later", "word", "2026-10-30T12:00:00Z"),
  item("p-due", "phrase", "2026-10-29T12:00:00Z"), // due exactly now
  item("e-later", "expression", "2026-11-05T12:00:00Z"),
  item("g-due", "grammar", "2026-10-01T12:00:00Z"),
];

const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe("My English filters", () => {
  it("parse from the URL with safe fallbacks", () => {
    expect(parseItemFilters({})).toEqual({ type: "all", status: "all" });
    expect(parseItemFilters({ type: "word", status: "due" })).toEqual({ type: "word", status: "due" });
    expect(parseItemFilters({ type: "grammar", status: ["due", "all"] })).toEqual({
      type: "all",
      status: "all",
    });
  });

  it("build a query string without defaults", () => {
    expect(itemFiltersQuery({ type: "all", status: "all" })).toBe("");
    expect(itemFiltersQuery({ type: "word", status: "all" })).toBe("?type=word");
    expect(itemFiltersQuery({ type: "expression", status: "due" })).toBe("?type=expression&status=due");
  });

  it("filter by type: words vs everything else", () => {
    expect(ids(filterItems(ITEMS, { type: "all", status: "all" }, NOW))).toEqual(ids(ITEMS));
    expect(ids(filterItems(ITEMS, { type: "word", status: "all" }, NOW))).toEqual(["w-due", "w-later"]);
    expect(ids(filterItems(ITEMS, { type: "expression", status: "all" }, NOW))).toEqual([
      "p-due",
      "e-later",
      "g-due",
    ]);
  });

  it("filter by due status, including items due exactly now", () => {
    expect(isDue(ITEMS[2]!, NOW)).toBe(true);
    expect(ids(filterItems(ITEMS, { type: "all", status: "due" }, NOW))).toEqual(["w-due", "p-due", "g-due"]);
    expect(ids(filterItems(ITEMS, { type: "word", status: "due" }, NOW))).toEqual(["w-due"]);
  });

  it("link words to Vocabulary and the rest to Expressions", () => {
    expect(itemHref("word", "x")).toBe("/vocabulary/x");
    expect(itemHref("phrase", "x")).toBe("/expressions/x");
    expect(itemHref("grammar", "x")).toBe("/expressions/x");
  });
});
