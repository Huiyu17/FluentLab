import { CircleAlert, MailCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function AuthCard({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 rounded-2xl border bg-card p-8">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-serif text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      {children}
      {footer && <p className="text-center text-sm text-muted-foreground">{footer}</p>}
    </div>
  );
}

/** Form-level message. Errors use role="alert"; confirmations use role="status". */
export function AuthAlert({
  tone,
  children,
}: {
  tone: "error" | "success" | "warning";
  children: ReactNode;
}) {
  const Icon = tone === "success" ? MailCheck : CircleAlert;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm text-foreground",
        tone === "error" && "bg-destructive-soft",
        tone === "success" && "bg-primary-soft",
        tone === "warning" && "bg-warning-soft",
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "error" && "text-destructive",
          tone === "success" && "text-primary",
          tone === "warning" && "text-warning",
        )}
      />
      <div>{children}</div>
    </div>
  );
}

export function AuthFormSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export const UNCONFIGURED_NOTICE = (
  <AuthAlert tone="warning">
    Supabase is not configured, so accounts are unavailable. Add your project URL and anon key to{" "}
    <code>.env.local</code> (see <code>.env.example</code>).
  </AuthAlert>
);
