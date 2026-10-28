"use client";

import { CircleAlert, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Friendly empty state: one line of context and (at most) one next step. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div
          aria-hidden
          className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary"
        >
          {icon}
        </div>
      )}
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="max-w-[48ch] text-muted-foreground">{description}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

/** Error state with an optional retry. Never shows raw error details to the user. */
export function ErrorState({
  title = "Something went wrong",
  description = "This part of FluentLab didn't load. Your progress is safe. Please try again.",
  onRetry,
  className,
}: {
  title?: string;
  description?: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border bg-card px-6 py-12 text-center",
        className,
      )}
    >
      <div
        aria-hidden
        className="flex size-11 items-center justify-center rounded-full bg-destructive-soft text-destructive"
      >
        <CircleAlert className="size-5" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-[48ch] text-muted-foreground">{description}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="mt-2">
          <RotateCw aria-hidden />
          Try again
        </Button>
      )}
    </div>
  );
}
