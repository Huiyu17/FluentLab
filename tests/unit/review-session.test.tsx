// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordReviewResult } from "@/lib/actions/review";
import type { ReviewItem } from "@/lib/data/items";

const recordReviewAction = vi.fn<(input: unknown) => Promise<RecordReviewResult>>();
vi.mock("@/lib/actions/review", () => ({
  recordReviewAction: (input: unknown) => recordReviewAction(input),
}));

const { ReviewSession } = await import("@/components/review/review-session");

function item(id: string, expression: string, overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id,
    type: "phrase",
    expression,
    meaning: `Meaning of ${expression}`,
    nativeMeaning: null,
    example: `Example with ${expression}`,
    tryIt: null,
    ease: 2.5,
    intervalDays: 0,
    masteryScore: 0,
    reviewCount: 0,
    ...overrides,
  };
}

const ITEMS = [item("a", "touch base"), item("b", "tentative", { type: "word", intervalDays: 1 })];

function recorded(reviewCount: number, applied = true): RecordReviewResult {
  return {
    status: "recorded",
    applied,
    state: { ease: 2.3, intervalDays: 0, masteryScore: 0, reviewCount, nextReviewAt: "2026-10-29T12:10:00Z" },
  };
}

const heading = () => screen.getByRole("heading", { level: 2 });

async function reveal() {
  fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
}

async function rateWith(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

beforeEach(() => recordReviewAction.mockReset().mockResolvedValue(recorded(1)));
afterEach(cleanup);

describe("ReviewSession", () => {
  it("hides the answer until asked, then shows it with interval previews", async () => {
    render(<ReviewSession items={ITEMS} />);
    expect(heading()).toHaveTextContent("touch base");
    expect(screen.queryByText("Meaning of touch base")).not.toBeInTheDocument();

    await reveal();
    expect(screen.getByText("Meaning of touch base")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Again/ })).toHaveTextContent("Again10 min");
    expect(screen.getByRole("button", { name: /Good/ })).toHaveTextContent("Good1 day");
    expect(screen.getByRole("button", { name: /Easy/ })).toHaveTextContent("Easy3 days");
  });

  it("records the rating with the expected review count and moves on", async () => {
    render(<ReviewSession items={ITEMS} />);
    await reveal();
    await rateWith(/Good/);

    expect(recordReviewAction).toHaveBeenCalledWith({
      itemId: "a",
      rating: "good",
      mode: "recall",
      expectedReviewCount: 0,
    });
    expect(heading()).toHaveTextContent("tentative");
    expect(screen.getByText("1 of 2 done")).toBeInTheDocument();
  });

  it("logs use_in_sentence when the learner wrote a sentence, and shows it back", async () => {
    render(<ReviewSession items={ITEMS} />);
    fireEvent.change(screen.getByLabelText(/Use it in a sentence/), {
      target: { value: "Let's touch base." },
    });
    await reveal();
    expect(screen.getByText("Let's touch base.")).toBeInTheDocument();
    await rateWith(/Hard/);
    expect(recordReviewAction).toHaveBeenCalledWith(expect.objectContaining({ mode: "use_in_sentence" }));
  });

  it("brings an 'Again' card back at the end with its new review count", async () => {
    render(<ReviewSession items={ITEMS} />);
    await reveal();
    await rateWith(/Again/);
    expect(heading()).toHaveTextContent("tentative");
    expect(screen.getByText("0 of 2 done")).toBeInTheDocument();

    await reveal();
    await rateWith(/Good/);
    expect(heading()).toHaveTextContent("touch base");

    recordReviewAction.mockResolvedValue(recorded(2));
    await reveal();
    await rateWith(/Good/);
    expect(recordReviewAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ itemId: "a", expectedReviewCount: 1 }),
    );
    expect(screen.getByRole("heading", { name: "Review done" })).toBeInTheDocument();
  });

  it("supports keys 1–4, only once the answer shows", async () => {
    render(<ReviewSession items={ITEMS} />);
    fireEvent.keyDown(window, { key: "3" });
    expect(recordReviewAction).not.toHaveBeenCalled();

    await reveal();
    await act(async () => {
      fireEvent.keyDown(window, { key: "4" });
    });
    expect(recordReviewAction).toHaveBeenCalledWith(expect.objectContaining({ rating: "easy" }));
  });

  it("keeps the card and shows the error when saving fails", async () => {
    recordReviewAction.mockResolvedValue({ status: "error", message: "We couldn't save that answer." });
    render(<ReviewSession items={ITEMS} />);
    await reveal();
    await rateWith(/Good/);
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't save that answer.");
    expect(heading()).toHaveTextContent("touch base");
  });

  it("skips items deleted elsewhere and summarises applied answers", async () => {
    recordReviewAction.mockResolvedValueOnce({ status: "missing" }).mockResolvedValueOnce(recorded(2));
    render(<ReviewSession items={ITEMS} />);
    await reveal();
    await rateWith(/Good/);
    await reveal();
    await rateWith(/Easy/);

    expect(screen.getByRole("heading", { name: "Review done" })).toBeInTheDocument();
    const easy = screen.getByText("Easy", { selector: "dt" }).nextElementSibling;
    const good = screen.getByText("Good", { selector: "dt" }).nextElementSibling;
    expect(easy).toHaveTextContent("1");
    expect(good).toHaveTextContent("0");
  });
});
