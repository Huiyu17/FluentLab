import { GAP_STATUS_LABELS, type GapStatus } from "@/lib/domain/gaps";
import type { GapSeverity } from "@/lib/domain/recommendations";
import { cn } from "@/lib/utils";

const chip = "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium";

const SEVERITY: Record<GapSeverity, { label: string; className: string }> = {
  high: { label: "High priority", className: "bg-destructive-soft text-destructive" },
  medium: { label: "Medium priority", className: "bg-warning-soft text-warning" },
  low: { label: "Low priority", className: "bg-muted text-muted-foreground" },
};

export const GAP_STATUS_STYLES: Record<GapStatus, string> = {
  emerging: "bg-muted text-muted-foreground",
  active: "bg-coral-soft text-coral",
  improving: "bg-primary-soft text-primary",
  resolved: "bg-primary-soft text-primary",
  dismissed: "bg-muted text-muted-foreground",
};

export function SeverityBadge({ severity, className }: { severity: GapSeverity; className?: string }) {
  return (
    <span className={cn(chip, SEVERITY[severity].className, className)}>{SEVERITY[severity].label}</span>
  );
}

export function GapStatusBadge({ status, className }: { status: GapStatus; className?: string }) {
  return <span className={cn(chip, GAP_STATUS_STYLES[status], className)}>{GAP_STATUS_LABELS[status]}</span>;
}
