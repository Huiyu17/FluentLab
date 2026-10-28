import { describe, expect, it } from "vitest";
import {
  GAP_SUB_CATEGORIES,
  GapPairSchema,
  OptionalGapPairSchema,
  isValidGapPair,
} from "@/lib/domain/taxonomy";

describe("gap taxonomy", () => {
  it("sub-categories are unique across categories", () => {
    expect(new Set(GAP_SUB_CATEGORIES).size).toBe(GAP_SUB_CATEGORIES.length);
  });

  it("validates category/sub-category pairs", () => {
    expect(isValidGapPair("pragmatics", "polite_requests")).toBe(true);
    expect(isValidGapPair("grammar", "polite_requests")).toBe(false);
    expect(isValidGapPair("naturalness", "word_choice")).toBe(false);
    expect(isValidGapPair("toString", "word_choice")).toBe(false);
  });

  it("GapPairSchema rejects mismatched pairs", () => {
    expect(GapPairSchema.safeParse({ category: "grammar", subCategory: "articles" }).success).toBe(true);
    expect(GapPairSchema.safeParse({ category: "grammar", subCategory: "idioms" }).success).toBe(false);
  });

  it("OptionalGapPairSchema allows a null sub-category but not a mismatched one", () => {
    expect(OptionalGapPairSchema.safeParse({ category: "register", subCategory: null }).success).toBe(true);
    expect(OptionalGapPairSchema.safeParse({ category: "register", subCategory: "too_formal" }).success).toBe(
      true,
    );
    expect(OptionalGapPairSchema.safeParse({ category: "register", subCategory: "tenses" }).success).toBe(
      false,
    );
  });
});
