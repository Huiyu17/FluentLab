// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunReviewResult } from "@/lib/actions/conversation-review-state";

const router = { refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const runReviewAction = vi.fn<(id: unknown) => Promise<RunReviewResult>>();
vi.mock("@/lib/actions/conversation-review", () => ({
  runReviewAction: (id: unknown) => runReviewAction(id),
}));

const { ReviewRunner } = await import("@/components/review/review-runner");

const ID = "5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c";

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ReviewRunner", () => {
  it("starts the review once by itself, shows progress, then refreshes into the review", async () => {
    let finish: (r: RunReviewResult) => void = () => {};
    runReviewAction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<ReviewRunner conversationId={ID} />);

    expect(screen.getByRole("status")).toHaveTextContent("Reading your conversation");
    expect(runReviewAction).toHaveBeenCalledTimes(1);
    expect(runReviewAction).toHaveBeenCalledWith(ID);

    await act(async () => finish({ status: "completed" }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(runReviewAction).toHaveBeenCalledTimes(1);
  });

  it("shows a failure with Try again, which runs the review again", async () => {
    runReviewAction.mockResolvedValueOnce({
      status: "failed",
      message: "That took too long.",
      canRetry: true,
    });
    render(<ReviewRunner conversationId={ID} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("That took too long.");
    runReviewAction.mockResolvedValueOnce({ status: "completed" });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    expect(runReviewAction).toHaveBeenCalledTimes(2);
    expect(router.refresh).toHaveBeenCalled();
  });

  it("waits for Try again after an earlier failure instead of spending quota on every visit", () => {
    render(
      <ReviewRunner
        conversationId={ID}
        failure={{ message: "The AI service isn't responding.", canRetry: true }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("isn't responding");
    expect(runReviewAction).not.toHaveBeenCalled();
  });

  it("offers no retry when there is nothing to review", () => {
    render(<ReviewRunner conversationId={ID} failure={{ message: "Nothing to review.", canRetry: false }} />);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("checks again later while another tab holds the review", async () => {
    vi.useFakeTimers();
    runReviewAction
      .mockResolvedValueOnce({ status: "in_progress" })
      .mockResolvedValueOnce({ status: "completed" });
    render(<ReviewRunner conversationId={ID} />);
    await act(async () => {});
    expect(screen.getByRole("status")).toHaveTextContent("another tab");

    await act(async () => vi.advanceTimersByTime(15_000));
    expect(runReviewAction).toHaveBeenCalledTimes(2);
    expect(router.refresh).toHaveBeenCalled();
  });

  it("goes back to the chat if the conversation is still active", async () => {
    runReviewAction.mockResolvedValueOnce({ status: "active" });
    render(<ReviewRunner conversationId={ID} />);
    await act(async () => {});
    expect(router.push).toHaveBeenCalledWith(`/conversations/${ID}`);
  });
});
