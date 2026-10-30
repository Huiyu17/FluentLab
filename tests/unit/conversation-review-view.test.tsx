// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversationMessage } from "@/lib/data/conversations";
import type { ConversationReviewView, ReviewCorrection } from "@/lib/data/reviews";

vi.mock("@/lib/actions/conversation-review", () => ({ saveReviewExpressionAction: vi.fn() }));
const { AnnotatedTranscript, ConversationPatterns, ReviewSummary } =
  await import("@/components/review/conversation-review");

afterEach(cleanup);

const message = (
  id: string,
  role: "user" | "assistant",
  content: string,
  seq: number,
): ConversationMessage => ({
  id,
  role,
  content,
  seq,
  createdAt: "2026-10-29T12:00:00Z",
});

const MESSAGES = [
  message("a0", "assistant", "Hey! Come on in.", 0),
  message("u1", "user", "I have some question about the homework 3.", 1),
  message("a2", "assistant", "Sure, which part?", 2),
  message("u3", "user", "Could you walk me through question 3?", 3),
];

const CORRECTION: ReviewCorrection = {
  id: "c1",
  messageId: "u1",
  position: 0,
  original: "I have some question about the homework 3.",
  improved: "I have a question about Homework 3.",
  category: "grammar",
  subCategory: "articles",
  isGrammatical: false,
  explanation: "Leave out 'the' before a numbered assignment.",
  saveableExpressions: [{ expression: "I have a question about…", meaning: "a natural way to start" }],
};

const REVIEW: ConversationReviewView = {
  summary: "You got straight to the point.",
  overallLabel: "developing",
  scores: { fluency: 65, naturalness: 60, grammar: 55, vocabulary: 65, confidence: 70 },
  strengths: ["Clear question"],
  model: "gemini/reviewer-v2",
  corrections: [CORRECTION],
};

describe("AnnotatedTranscript", () => {
  it("annotates corrected learner messages in place", () => {
    render(<AnnotatedTranscript messages={MESSAGES} corrections={[CORRECTION]} speaker="Professor Lee" />);
    const items = within(screen.getByRole("list", { name: "Conversation with review" })).getAllByRole(
      "listitem",
    );
    expect(items).toHaveLength(4);

    const corrected = items[1]!;
    expect(within(corrected).getByText("What you said")).toBeVisible();
    expect(within(corrected).getByText("I have a question about Homework 3.")).toBeVisible();
    expect(within(corrected).getByText(/Leave out 'the'/)).toBeVisible();
    expect(within(corrected).getByText("Grammar error")).toBeVisible();
    expect(within(corrected).getByText("Grammar · Articles")).toBeVisible();
  });

  it("marks an uncorrected learner message only as 'No suggestions', never as correct", () => {
    render(<AnnotatedTranscript messages={MESSAGES} corrections={[CORRECTION]} speaker="Professor Lee" />);
    const items = screen.getAllByRole("listitem");
    const uncorrected = items[3]!;
    expect(within(uncorrected).getByText("No suggestions")).toBeVisible();
    expect(uncorrected.textContent).not.toMatch(/correct|✓/i);
    // The partner's turns are context only.
    expect(items[0]!.textContent).toBe("Professor LeeHey! Come on in.");
    expect(items[2]!.textContent).not.toMatch(/suggestion/i);
  });

  it("labels grammatical-but-unnatural corrections differently from grammar errors", () => {
    const unnatural = {
      ...CORRECTION,
      isGrammatical: true,
      category: "pragmatics" as const,
      subCategory: null,
    };
    render(<AnnotatedTranscript messages={MESSAGES} corrections={[unnatural]} speaker="Professor Lee" />);
    expect(screen.getByText("Grammatically correct, could sound more natural")).toBeVisible();
    expect(screen.queryByText("Grammar error")).toBeNull();
    expect(screen.getByText("Pragmatics")).toBeVisible();
  });
});

describe("ReviewSummary", () => {
  const worthSaving = [
    {
      correctionId: "c1",
      index: 0,
      expression: "I have a question about…",
      meaning: "a natural way to start",
      savedItemId: null,
    },
    {
      correctionId: "c2",
      index: 0,
      expression: "walk me through",
      meaning: "explain step by step",
      savedItemId: "item-9",
    },
  ];

  it("shows the label, the five captioned indicators, strengths and expressions with saved state", () => {
    render(<ReviewSummary review={REVIEW} worthSaving={worthSaving} sample={false} />);
    expect(screen.getByText("Developing")).toBeVisible();
    for (const [label, score] of [
      ["Fluency", "65"],
      ["Naturalness", "60"],
      ["Grammar", "55"],
      ["Vocabulary", "65"],
      ["Confidence", "70"],
    ]) {
      const term = screen.getByText(label, { selector: "dt" });
      expect(term.parentElement).toHaveTextContent(`${label}${score}`);
    }
    expect(screen.getByText(/AI-estimated learning indicators/)).toBeVisible();
    expect(screen.getByText("Clear question")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add to My English: I have a question about…" })).toBeVisible();
    expect(screen.getByRole("link", { name: "In My English: walk me through" })).toHaveAttribute(
      "href",
      "/expressions/item-9",
    );
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("says when the review is a sample", () => {
    render(<ReviewSummary review={REVIEW} worthSaving={[]} sample />);
    expect(screen.getByRole("note")).toHaveTextContent("Sample review");
    expect(screen.queryByText("Expressions worth saving")).toBeNull();
  });
});

describe("ConversationPatterns", () => {
  const patterns = [
    { gapId: "g1", title: "Word choice", status: "active" as const, issues: 2, goodUses: 0 },
    { gapId: "g2", title: "Articles", status: "emerging" as const, issues: 1, goodUses: 0 },
    { gapId: "g3", title: "Polite requests", status: "emerging" as const, issues: 0, goodUses: 1 },
  ];

  it("links tracked gaps, explains 'Watching' and shows what this conversation added", () => {
    render(<ConversationPatterns patterns={patterns} />);
    const section = screen.getByRole("region", { name: "Patterns from this conversation" });
    expect(within(section).getByRole("link", { name: /Word choice/ })).toHaveAttribute("href", "/gaps/g1");
    expect(within(section).getByText("2 moments to work on")).toBeVisible();
    expect(within(section).getByText("Focus area")).toBeVisible();
    // Emerging gaps aren't in the Gap Tracker yet: no link.
    expect(within(section).queryByRole("link", { name: /Articles/ })).toBeNull();
    expect(within(section).getByText("Watching")).toBeVisible();
    expect(within(section).getByText(/came up once/)).toBeVisible();
    // A gap with only good usage shows that, without a status chip.
    const polite = within(section).getByText("Polite requests").closest("li")!;
    expect(polite).toHaveTextContent("done well 1×");
    expect(polite.textContent).not.toMatch(/Watching|Focus/);
  });

  it("renders nothing without patterns", () => {
    const { container } = render(<ConversationPatterns patterns={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
