// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreateDebriefState } from "@/lib/actions/debrief-state";

const createDebriefAction =
  vi.fn<(prev: CreateDebriefState, data: FormData) => Promise<CreateDebriefState>>();
vi.mock("@/lib/actions/debrief", () => ({
  createDebriefAction: (prev: CreateDebriefState, data: FormData) => createDebriefAction(prev, data),
}));

const { DebriefForm } = await import("@/components/debrief/debrief-form");

afterEach(cleanup);

describe("DebriefForm", () => {
  it("keeps the learner's text and shows the reason when debriefing fails", async () => {
    createDebriefAction.mockResolvedValue({
      status: "error",
      message: "The free AI quota is used up for now.",
    });
    render(<DebriefForm />);

    fireEvent.change(screen.getByLabelText("What happened?"), { target: { value: "At the pharmacy…" } });
    fireEvent.change(screen.getByLabelText("What did you say? (optional)"), {
      target: { value: "Medicine finish?" },
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Debrief it" })));

    expect(screen.getByRole("alert")).toHaveTextContent("quota is used up");
    expect(screen.getByLabelText("What happened?")).toHaveValue("At the pharmacy…");
    expect(screen.getByLabelText("What did you say? (optional)")).toHaveValue("Medicine finish?");
    const sent = createDebriefAction.mock.calls[0]![1];
    expect(sent.get("situation")).toBe("At the pharmacy…");
    expect(sent.get("whatYouSaid")).toBe("Medicine finish?");
  });

  it("shows field errors next to their field", async () => {
    createDebriefAction.mockResolvedValue({
      status: "error",
      fieldErrors: { situation: "Describe what happened." },
    });
    render(<DebriefForm />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Debrief it" })));
    expect(screen.getByLabelText("What happened?")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Describe what happened.")).toBeVisible();
  });
});
