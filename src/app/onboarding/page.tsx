import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/shell/brand";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Welcome" };

const STEPS = [
  "Your native language",
  "Where you use English (campus, social, career…)",
  "What you want to get better at",
  "How many minutes a day",
];

export default function OnboardingPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-5 py-12">
      <Brand />
      <div className="flex w-full max-w-md flex-col gap-6 rounded-2xl border bg-card p-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-2xl font-semibold">Let&apos;s set up your practice</h1>
          <p className="text-muted-foreground">
            Onboarding arrives in M2. It will ask four quick questions so FluentLab can tailor your
            conversations:
          </p>
        </div>
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <Button asChild>
          <Link href="/today">Continue to Today</Link>
        </Button>
      </div>
    </main>
  );
}
