import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_SECTIONS, isNavItemActive } from "@/components/shell/nav";

describe("navigation", () => {
  it("marks own path and nested paths active, but not siblings with a shared prefix", () => {
    expect(isNavItemActive("/gaps", "/gaps")).toBe(true);
    expect(isNavItemActive("/gaps/123", "/gaps")).toBe(true);
    expect(isNavItemActive("/gapsfoo", "/gaps")).toBe(false);
    expect(isNavItemActive("/today", "/gaps")).toBe(false);
  });

  it("every nav item has a page under the (app) route group", () => {
    for (const item of NAV_SECTIONS.flatMap((s) => s.items)) {
      const page = path.join("src", "app", "(app)", item.href, "page.tsx");
      expect(existsSync(page), page).toBe(true);
    }
  });
});
