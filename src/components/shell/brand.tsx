import Link from "next/link";
import { Sprout } from "lucide-react";

export function Brand() {
  return (
    <Link href="/today" className="flex items-center gap-2 rounded-lg px-3 py-1">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Sprout aria-hidden className="size-4" />
      </span>
      <span className="font-serif text-lg font-semibold tracking-tight">FluentLab</span>
    </Link>
  );
}
