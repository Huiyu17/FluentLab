// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SAMPLE_NOTICE, StudioCardView } from "@/components/studio/studio-card";
import { mockStudioCard } from "@/lib/ai/fixtures/studio";

afterEach(cleanup);

describe("StudioCardView", () => {
  const card = mockStudioCard("touch base", "expression");

  it("shows every part of the explanation", () => {
    render(<StudioCardView card={card} />);
    expect(screen.getByRole("heading", { level: 2, name: "touch base" })).toBeInTheDocument();
    expect(screen.getByText(/Phrase/)).toHaveTextContent("Phrase · /tʌtʃ beɪs/");
    expect(screen.getByText("Casual to neutral")).toBeInTheDocument();
    expect(screen.getByText("Common")).toBeInTheDocument();
    for (const title of [
      "Meaning",
      "How it feels",
      "Common patterns",
      "Examples",
      "Common mistake",
      "Similar expressions",
      "Try it",
    ]) {
      expect(screen.getByRole("heading", { level: 3, name: title })).toBeInTheDocument();
    }
    expect(screen.getByText("Let's touch base after the lecture.")).toBeInTheDocument();
    expect(screen.getByText("check in")).toBeInTheDocument();
  });

  it("labels the mistake and the fix for screen readers", () => {
    render(<StudioCardView card={card} />);
    expect(screen.getByText("Let's touch the base tomorrow.")).toHaveTextContent(
      "Avoid: Let's touch the base tomorrow.",
    );
    expect(screen.getByText("Let's touch base tomorrow.")).toHaveTextContent(
      "Say: Let's touch base tomorrow.",
    );
  });

  it("says when the card is a sample", () => {
    const { rerender } = render(<StudioCardView card={card} sample />);
    expect(screen.getByRole("note")).toHaveTextContent(SAMPLE_NOTICE);
    rerender(<StudioCardView card={card} />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("leaves out empty optional sections", () => {
    render(<StudioCardView card={mockStudioCard("ephemeral", "vocabulary")} headingLevel={1} />);
    expect(screen.getByRole("heading", { level: 1, name: "ephemeral" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Common mistake" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Similar expressions" })).not.toBeInTheDocument();
  });
});
