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

/**
 * Fails when the page is wider than a phone screen (e.g. a grid column stretched by unbreakable
 * text), listing the elements that stick out. Content inside its own horizontal scroll container
 * (a wide table in `overflow-x-auto`) is fine. Checks at 390 px, then restores the viewport.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string) {
  const previous = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  const result = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const scrollsItself = (el: Element) => {
      for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const overflow = getComputedStyle(node).overflowX;
        if (overflow === "auto" || overflow === "scroll") return true;
      }
      return false;
    };
    const offenders =
      document.documentElement.scrollWidth > width
        ? [...document.querySelectorAll("main *")]
            .filter((el) => el.getBoundingClientRect().right > width + 1 && !scrollsItself(el))
            .slice(0, 5)
            .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join(".")}`)
        : [];
    return { scrollWidth: document.documentElement.scrollWidth, width, offenders };
  });
  if (previous) await page.setViewportSize(previous);
  expect(
    { scrollWidth: result.scrollWidth, offenders: result.offenders },
    `${label}: wider than a 390px screen`,
  ).toEqual({ scrollWidth: result.width, offenders: [] });
}
