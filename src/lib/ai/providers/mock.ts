import { AIError } from "../errors";
import { mockReview } from "../fixtures/review";
import { mockStudioCard } from "../fixtures/studio";
import { readTagged } from "../prompts/data";
import type { LLMProvider, TextRequest } from "../provider";
import { STUDIO_KINDS, type StudioKind } from "@/lib/validation/studio";

// In-character sample replies for tutor requests, picked by turn so a whole conversation is
// deterministic. Generic enough to fit any scenario.
const MOCK_OPENING = "Hi there! Thanks for coming by. What can I do for you?";
const MOCK_REPLIES = [
  "Oh, okay. Can you tell me a bit more about that?",
  "I see what you mean. How long has that been going on?",
  "Got it. What would you like to do next?",
  "That makes sense. Is there anything else on your mind?",
];
const GENERIC = "This is a sample reply from the mock AI provider.";

function mockText(req: TextRequest): string {
  const briefing = req.messages.find((m) => m.role === "user")?.content ?? "";
  if (readTagged(briefing, "ai_role") === null) return GENERIC;
  const learnerTurns = req.messages.filter((m) => m.role === "user").length - 1;
  if (learnerTurns === 0) return MOCK_OPENING;
  return MOCK_REPLIES[(learnerTurns - 1) % MOCK_REPLIES.length]!;
}

/** Deterministic provider for keyless dev, tests and E2E. No network, no keys. */
export const mockProvider: LLMProvider = {
  name: "mock",

  async generateText(req) {
    return mockText(req);
  },

  async *streamText(req) {
    // Word by word, like a real stream.
    for (const word of mockText(req).split(/(?<= )/)) yield word;
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
      case "conversation_review":
        return mockReview(request);
      default:
        throw new AIError("not_configured", `The mock provider has no fixture for "${req.name}".`);
    }
  },
};
