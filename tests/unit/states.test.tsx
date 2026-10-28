// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorState } from "@/components/shared/states";

afterEach(cleanup);

describe("shared states", () => {
  it("EmptyState renders title, description and action", () => {
    render(
      <EmptyState title="No gaps yet" description="Finish a conversation" action={<button>Go</button>} />,
    );
    expect(screen.getByRole("heading", { name: "No gaps yet" })).toBeInTheDocument();
    expect(screen.getByText("Finish a conversation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });

  it("ErrorState is announced and calls retry", () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("ErrorState hides the retry button when no handler is given", () => {
    render(<ErrorState />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
