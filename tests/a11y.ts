import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** WCAG 2.1 A and AA rules (docs/CLAUDE.md: contrast AA, labels, focus). */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Runs axe on the current page and fails on serious or critical violations, listing each rule with
 * the elements it found, so a failure says exactly what to fix. Minor and moderate findings are
 * printed, not failed.
 */
export async function expectNoA11yViolations(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const describe = (v: (typeof violations)[number]) =>
    `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes
      .slice(0, 5)
      .map((n) => n.target.join(" "))
      .join("\n    ")}`;
  const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const minor = violations.filter((v) => !blocking.includes(v));
  if (minor.length > 0) console.log(`[a11y] ${label}: minor findings\n  ${minor.map(describe).join("\n  ")}`);
  expect(blocking.map(describe), `${label}: serious/critical accessibility violations`).toEqual([]);
}
