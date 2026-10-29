// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TodayDashboard } from "@/components/today/today-dashboard";
import type { TodayData } from "@/lib/data/today";
import { summarizeStreak } from "@/lib/domain/streak";

afterEach(cleanup);

const NY = "America/New_York";
const NOW = new Date("2026-10-28T20:00:00Z"); // Wed 4pm in New York

const EMPTY: TodayData = {
  today: "2026-10-28",
  plan: [
    {
      kind: "conversation",
      title: "Office Hours",
      reason: "Matches where you use English: Campus.",
      href: "/simulator/office-hours",
      minutes: 8,
      scenarioSlug: "office-hours",
      gapId: null,
    },
    {
      kind: "studio",
      title: "Learn one natural expression",
      reason: "Add a phrase you can use in campus situations.",
      href: "/expressions",
      minutes: 5,
    },
  ],
  planMinutes: 13,
  dailyGoalMinutes: 20,
  streak: summarizeStreak([], NOW, NY),
  reviews: { dueCount: 0, totalCount: 0, nextDueAt: null },
  focusGaps: [],
  openGapCount: 0,
  recentActivity: [],
  indicators: null,
};

const FULL: TodayData = {
  ...EMPTY,
  streak: summarizeStreak(["2026-10-28T14:00:00Z", "2026-10-27T14:00:00Z"], NOW, NY),
  reviews: { dueCount: 4, totalCount: 12, nextDueAt: null },
  focusGaps: [
    {
      id: "g1",
      title: "Overly direct requests",
      description: "Requests sound like commands in polite situations.",
      status: "active",
      severity: "high",
      evidenceCount: 5,
      conversationsCount: 3,
      lastDetectedAt: "2026-10-27T10:00:00Z",
    },
    {
      id: "g2",
      title: "Ending conversations",
      description: "",
      status: "improving",
      severity: "low",
      evidenceCount: 1,
      conversationsCount: 1,
      lastDetectedAt: "2026-10-20T10:00:00Z",
    },
  ],
  openGapCount: 4,
  recentActivity: [
    {
      kind: "conversation",
      id: "c1",
      title: "Office Hours",
      status: "completed",
      at: "2026-10-28T13:10:00Z",
      score: 72,
      href: "/conversations/c1/review",
    },
    {
      kind: "debrief",
      id: "d1",
      title: "Asking my TA for an extension",
      at: "2026-10-27T15:00:00Z",
      href: "/debrief/d1",
    },
  ],
  indicators: {
    conversationId: "c1",
    at: "2026-10-28T13:12:00Z",
    overallLabel: "developing",
    scores: { fluency: 70, naturalness: 61, grammar: 82, vocabulary: 66, confidence: 58 },
  },
};

function section(name: string) {
  return screen.getByRole("region", { name });
}

describe("TodayDashboard", () => {
  it("greets the learner in their time zone", () => {
    render(<TodayDashboard data={EMPTY} name="Huiyu" now={NOW} timeZone={NY} />);
    expect(screen.getByRole("heading", { level: 1, name: "Good afternoon, Huiyu" })).toBeInTheDocument();
    expect(screen.getByText("Wednesday, October 28")).toBeInTheDocument();
  });

  it("greets without a name", () => {
    render(<TodayDashboard data={EMPTY} name={null} now={NOW} timeZone={NY} />);
    expect(screen.getByRole("heading", { level: 1, name: "Good afternoon" })).toBeInTheDocument();
  });

  it("links every plan item with its reason", () => {
    render(<TodayDashboard data={EMPTY} name={null} now={NOW} timeZone={NY} />);
    const plan = section("Today's plan");
    expect(within(plan).getByText("About 13 min. Your daily goal is 20 min.")).toBeInTheDocument();
    const links = within(plan).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/simulator/office-hours", "/expressions"]);
    expect(links[0]).toHaveTextContent("Matches where you use English: Campus.");
  });

  it("shows friendly empty states for a new learner", () => {
    render(<TodayDashboard data={EMPTY} name={null} now={NOW} timeZone={NY} />);

    expect(within(section("Practice streak")).getByText("0")).toBeInTheDocument();
    expect(within(section("Practice streak")).getByText(/to start a streak/)).toBeInTheDocument();
    expect(within(section("Reviews")).getByRole("link", { name: "Explore expressions" })).toHaveAttribute(
      "href",
      "/expressions",
    );
    expect(
      within(section("Focus areas")).getByRole("link", { name: "Start a conversation" }),
    ).toHaveAttribute("href", "/simulator");
    expect(within(section("Recent activity")).getByText("Nothing here yet")).toBeInTheDocument();
    expect(within(section("Latest indicators")).getByText("No indicators yet")).toBeInTheDocument();
  });

  it("always labels scores as AI-estimated learning indicators", () => {
    render(<TodayDashboard data={FULL} name={null} now={NOW} timeZone={NY} />);
    const indicators = section("Latest indicators");
    expect(within(indicators).getByText("AI-estimated learning indicators")).toBeInTheDocument();
    expect(within(indicators).getByText(/not an official assessment/)).toBeInTheDocument();
    expect(within(indicators).getByText("Fluency").parentElement).toHaveTextContent("70 out of 100");
    expect(within(indicators).getByRole("link", { name: "See the review" })).toHaveAttribute(
      "href",
      "/conversations/c1/review",
    );
  });

  it("shows streak, due reviews, gaps and recent activity", () => {
    render(<TodayDashboard data={FULL} name={null} now={NOW} timeZone={NY} />);

    const streak = section("Practice streak");
    expect(within(streak).getByText("2")).toBeInTheDocument();
    expect(within(streak).getByText("Today: practiced")).toBeInTheDocument();
    expect(within(streak).getByText("Mon: not practiced")).toBeInTheDocument();

    const reviews = section("Reviews");
    expect(within(reviews).getByText("due now")).toBeInTheDocument();
    expect(within(reviews).getByRole("link", { name: "Start review" })).toHaveAttribute(
      "href",
      "/my-english/review",
    );

    const focus = section("Focus areas");
    expect(within(focus).getByRole("link", { name: "View all 4" })).toHaveAttribute("href", "/gaps");
    const gapLink = within(focus).getByRole("link", { name: /Overly direct requests/ });
    expect(gapLink).toHaveAttribute("href", "/gaps/g1");
    expect(gapLink).toHaveTextContent("High priority");
    expect(gapLink).toHaveTextContent("Seen 5× in 3 conversations");
    expect(within(focus).getByRole("link", { name: /Ending conversations/ })).toHaveTextContent("Improving");

    const activity = within(section("Recent activity")).getAllByRole("link");
    expect(activity[0]).toHaveTextContent("Office Hours");
    expect(activity[0]).toHaveTextContent("Reviewed · Score 72");
    expect(activity[0]).toHaveTextContent("Today");
    expect(activity[1]).toHaveTextContent("Debrief");
    expect(activity[1]).toHaveTextContent("Yesterday");
  });

  it("mentions the next review when nothing is due", () => {
    render(
      <TodayDashboard
        data={{ ...FULL, reviews: { dueCount: 0, totalCount: 3, nextDueAt: "2026-10-29T13:00:00Z" } }}
        name={null}
        now={NOW}
        timeZone={NY}
      />,
    );
    const reviews = section("Reviews");
    expect(within(reviews).getByText("All caught up")).toBeInTheDocument();
    expect(
      within(reviews).getByText("3 items saved in My English. Next review tomorrow."),
    ).toBeInTheDocument();
  });
});
