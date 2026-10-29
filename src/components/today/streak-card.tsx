import { Check } from "lucide-react";
import type { StreakSummary } from "@/lib/domain/streak";
import { cn } from "@/lib/utils";
import { DashboardCard } from "./dashboard-card";

function message({ current, practicedToday }: StreakSummary): string {
  if (practicedToday) return "You practiced today. See you tomorrow.";
  if (current > 0) return "Practice today to keep it going.";
  return "Finish a conversation, a review or a debrief to start a streak.";
}

export function StreakCard({ streak, className }: { streak: StreakSummary; className?: string }) {
  return (
    <DashboardCard id="streak" title="Practice streak" className={className}>
      <div className="flex flex-col gap-1">
        <p>
          <span className="font-serif text-4xl font-semibold lining-nums">{streak.current}</span>{" "}
          <span className="text-muted-foreground">{streak.current === 1 ? "day" : "days"}</span>
        </p>
        <p className="text-sm text-muted-foreground">{message(streak)}</p>
      </div>
      <ol aria-label="Last 7 days" className="grid grid-cols-7 gap-1">
        {streak.week.map((day) => (
          <li key={day.day} className="flex flex-col items-center gap-1.5">
            <span
              aria-hidden
              className={cn(
                "flex size-7 items-center justify-center rounded-full border",
                day.practiced ? "border-primary bg-primary text-primary-foreground" : "bg-muted",
                day.isToday && "ring-2 ring-primary ring-offset-2 ring-offset-card",
              )}
            >
              {day.practiced && <Check className="size-3.5" />}
            </span>
            <span
              aria-hidden
              className={cn("text-xs", day.isToday ? "font-medium" : "text-muted-foreground")}
            >
              {day.label}
            </span>
            <span className="sr-only">
              {day.isToday ? "Today" : day.label}: {day.practiced ? "practiced" : "not practiced"}
            </span>
          </li>
        ))}
      </ol>
    </DashboardCard>
  );
}
