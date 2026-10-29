import { AIError } from "../errors";
import { mockStudioCard } from "../fixtures/studio";
import { readTagged } from "../prompts/studio";
import type { LLMProvider } from "../provider";
import { STUDIO_KINDS, type StudioKind } from "@/lib/validation/studio";

/** Deterministic provider for keyless dev, tests and E2E. No network, no keys. */
export const mockProvider: LLMProvider = {
  name: "mock",

  async generateText() {
    return "This is a sample reply from the mock AI provider.";
  },

  async *streamText() {
    for (const word of "This is a sample reply from the mock AI provider.".split(" ")) {
      yield `${word} `;
    }
  },

  async generateJson(req) {
    // The original request is the first user turn (later ones may be repair prompts).
    const request = req.messages.find((m) => m.role === "user")?.content ?? "";
    switch (req.name) {
      case "studio_card": {
        const expression = readTagged(request, "expression");
        const kind = readTagged(request, "kind");
        if (!expression) throw new AIError("invalid_input", "Mock studio request without an expression.");
        const studioKind: StudioKind = STUDIO_KINDS.includes(kind as StudioKind)
          ? (kind as StudioKind)
          : "expression";
        return mockStudioCard(expression, studioKind);
      }
      default:
        throw new AIError("not_configured", `The mock provider has no fixture for "${req.name}".`);
    }
  },
};
