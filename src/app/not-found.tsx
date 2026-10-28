import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="font-serif text-3xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="text-muted-foreground">It may have moved, or the link might be off by a letter.</p>
      <Button asChild className="mt-4">
        <Link href="/today">Back to Today</Link>
      </Button>
    </main>
  );
}
