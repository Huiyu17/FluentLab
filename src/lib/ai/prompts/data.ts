/**
 * Learner-provided text goes into prompts only as tagged, escaped data inside a user turn,
 * never into the system prompt (docs/ARCHITECTURE.md → Security). Escaping `<`, `>` and `&`
 * means data can't close its own tag or open a fake one.
 */

export function escapeData(text: string): string {
  return text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);
}

export function unescapeData(text: string): string {
  return text.replace(
    /&(lt|gt|amp);/g,
    (_, entity: string) => ({ lt: "<", gt: ">", amp: "&" })[entity] ?? "",
  );
}

/** `<tag>escaped value</tag>` */
export function tagged(tag: string, value: string): string {
  return `<${tag}>${escapeData(value)}</${tag}>`;
}

/** Reads one tagged value written by `tagged` (used by the mock provider and tests). */
export function readTagged(content: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(content);
  return match ? unescapeData(match[1]!) : null;
}
