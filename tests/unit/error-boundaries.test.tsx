// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppError from "@/app/(app)/error";
import RootError from "@/app/error";
import GlobalError from "@/app/global-error";

afterEach(cleanup);

// What a failing data loader throws (e.g. "Could not load gaps."), plus something that must never
// reach the page.
const failure = Object.assign(new Error("Could not load gaps. relation language_gaps: secret detail"), {
  digest: "1234",
});

describe.each([
  ["(app)/error", AppError],
  ["app/error", RootError],
])("%s", (_, Boundary) => {
  it("shows a friendly message with Try again, never the error details", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    render(<Boundary error={failure} retry={retry} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong");
    expect(alert).toHaveTextContent("Your progress is safe");
    expect(document.body.textContent).not.toMatch(/Could not load|secret|language_gaps/);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    // Only the digest is logged.
    expect(console.error).toHaveBeenCalledWith("Route error", "1234");
  });
});

describe("global-error", () => {
  it("replaces the root layout with a minimal, detail-free message", () => {
    const retry = vi.fn();
    // It renders its own <html>/<body>; React warns when that sits inside a test container.
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<GlobalError error={failure} retry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("FluentLab ran into a problem");
    expect(document.body.textContent).not.toMatch(/Could not load|secret/);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
  });
});
