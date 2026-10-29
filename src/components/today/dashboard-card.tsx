import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Bordered row that links somewhere: hover fill and a visible focus ring. */
export const linkRow =
  "rounded-xl border p-4 transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none";

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** A titled dashboard section. */
export function DashboardCard({
  id,
  title,
  description,
  action,
  className,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn("flex flex-col gap-5 rounded-2xl border bg-card p-6", className)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-title`} className="text-lg font-semibold">
            {title}
          </h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** Compact empty state inside a dashboard card: one friendly line and at most one action. */
export function CardEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-start gap-2 rounded-xl bg-muted/60 p-5">
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
