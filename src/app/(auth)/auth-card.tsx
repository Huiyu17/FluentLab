import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Placeholder auth card until M2 implements Supabase Auth. */
export function AuthCard({
  title,
  description,
  footer,
}: {
  title: string;
  description: string;
  footer: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 rounded-2xl border bg-card p-8">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-serif text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <Button asChild size="lg">
        <Link href="/today">Explore the app</Link>
      </Button>
      <p className="text-center text-sm text-muted-foreground">{footer}</p>
    </div>
  );
}
