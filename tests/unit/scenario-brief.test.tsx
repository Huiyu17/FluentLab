// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ScenarioBrief } from "@/components/simulator/scenario-brief";
import type { SavedItem } from "@/lib/data/items";
import type { Scenario } from "@/lib/data/scenarios";

afterEach(cleanup);

const SCENARIO: Scenario = {
  id: "s1",
  slug: "office-hours",
  category: "campus",
  title: "Office Hours",
  description: "You are visiting your professor.",
  userRole: "A student stuck on Question 3",
  aiRole: "Professor Lee",
  aiPersonality: "Friendly but busy",
  goal: "Ask for clarification without sounding too dependent.",
  difficulty: "intermediate",
  openingLine: "Hey! Come on in.",
  estMinutes: 8,
  isCustom: false,
};

const TARGET: SavedItem = {
  id: "i1",
  type: "expression",
  expression: "Could you walk me through…?",
  meaning: "Could you explain it step by step?",
  masteryScore: 0.2,
  reviewCount: 1,
  nextReviewAt: "2026-10-29T00:00:00Z",
  createdAt: "2026-10-20T00:00:00Z",
};

describe("ScenarioBrief", () => {
  it("shows roles, goal, opening line and length", () => {
    render(<ScenarioBrief scenario={SCENARIO} targets={[]} />);
    expect(screen.getByRole("heading", { level: 1, name: "Office Hours" })).toBeInTheDocument();
    expect(screen.getByText("Campus")).toBeInTheDocument();
    expect(screen.getByText("A student stuck on Question 3")).toBeInTheDocument();
    expect(screen.getByText("Professor Lee")).toBeInTheDocument();
    expect(screen.getByText("Friendly but busy")).toBeInTheDocument();
    expect(screen.getByText("Ask for clarification without sounding too dependent.")).toBeInTheDocument();
    expect(screen.getByText(/Hey! Come on in\./)).toBeInTheDocument();
    expect(screen.getByText("About 8 min")).toBeInTheDocument();
  });

  it("says the other person opens when there is no opening line", () => {
    render(<ScenarioBrief scenario={{ ...SCENARIO, openingLine: null }} targets={[]} />);
    expect(screen.getByText("They'll open the conversation.")).toBeInTheDocument();
  });

  it("links target expressions to their saved cards, or explains how to get some", () => {
    const { rerender } = render(<ScenarioBrief scenario={SCENARIO} targets={[TARGET]} />);
    expect(screen.getByRole("link", { name: /Could you walk me through/ })).toHaveAttribute(
      "href",
      "/expressions/i1",
    );
    rerender(<ScenarioBrief scenario={SCENARIO} targets={[]} />);
    expect(screen.getByRole("link", { name: "Expression Studio" })).toHaveAttribute("href", "/expressions");
  });

  it("keeps Start disabled until conversations arrive, and says why", () => {
    render(<ScenarioBrief scenario={SCENARIO} targets={[]} />);
    const start = screen.getByRole("button", { name: "Start conversation" });
    expect(start).toBeDisabled();
    expect(start).toHaveAccessibleDescription("Starting conversations is coming in the next update.");
  });

  it("renders owner actions when given", () => {
    render(<ScenarioBrief scenario={SCENARIO} targets={[]} actions={<button>Edit</button>} />);
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});
