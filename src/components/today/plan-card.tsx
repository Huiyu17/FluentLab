import { BookOpen, ChevronRight, MessagesSquare, RotateCcw, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { Recommendation } from "@/lib/domain/recommendations";
import { cn } from "@/lib/utils";
import { DashboardCard, linkRow } from "./dashboard-card";

const KINDS: Record<Recommendation["kind"], { label: string; icon: LucideIcon }> = {
  conversation: { label: "Conversation", icon: MessagesSquare },
  review: { label: "Review", icon: RotateCcw },
  studio: { label: "Learn", icon: BookOpen },
};

export function PlanCard({
  plan,
  planMinutes,
  dailyGoalMinutes,
  className,
}: {
  plan: Recommendation[];
  planMinutes: number;
  dailyGoalMinutes: number;
  className?: string;
}) {
  return (
    <DashboardCard
      id="plan"
      title="Today's plan"
      description={`About ${planMinutes} min. Your daily goal is ${dailyGoalMinutes} min.`}
      className={className}
    >
      <ol className="flex flex-col gap-3">
        {plan.map((item) => {
          const { label, icon: Icon } = KINDS[item.kind];
          return (
            <li key={item.kind}>
              <Link href={item.href} className={cn(linkRow, "group flex items-center gap-4")}>
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"
                >
                  <Icon className="size-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {label} · {item.minutes} min
                  </span>
                  <span className="font-medium">{item.title}</span>
                  <span className="text-sm text-muted-foreground">{item.reason}</span>
                </span>
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
                />
              </Link>
            </li>
          );
        })}
      </ol>
    </DashboardCard>
  );
}
