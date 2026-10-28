import Link from "next/link";
import { Brand } from "@/components/shell/brand";
import { Button } from "@/components/ui/button";

const LOOP = [
  { step: "Practice", text: "Real-life conversations: office hours, small talk, career fairs." },
  { step: "Detect gaps", text: "After each conversation, see what sounded natural and what didn't." },
  { step: "Learn", text: "Understand why. Grammatically correct isn't always natural." },
  { step: "Reuse", text: "Saved expressions come back in your next conversations." },
  { step: "Improve", text: "FluentLab remembers your patterns and tracks how they change." },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-[1080px] items-center justify-between px-5 py-6 sm:px-8">
        <Brand />
        <Button asChild variant="ghost">
          <Link href="/login">Sign in</Link>
        </Button>
      </header>

      <main className="mx-auto flex max-w-[1080px] flex-col gap-16 px-5 pt-12 pb-24 sm:px-8 lg:pt-20">
        <section className="flex max-w-2xl flex-col gap-6">
          <h1 className="font-serif text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
            Sound natural in real-life English, not just correct.
          </h1>
          <p className="text-lg text-muted-foreground">
            You already know the grammar. FluentLab helps you handle the conversations that still feel hard:
            office hours, small talk, networking, and knowing how to end a chat.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/signup">Get started</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/today">Look around</Link>
            </Button>
          </div>
        </section>

        <section aria-labelledby="loop-heading" className="flex flex-col gap-6">
          <h2 id="loop-heading" className="text-xl font-semibold">
            How it works
          </h2>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {LOOP.map((item, i) => (
              <li key={item.step} className="flex flex-col gap-2 rounded-2xl border bg-card p-5">
                <span className="text-sm font-medium text-primary">
                  {i + 1}. {item.step}
                </span>
                <p className="text-sm text-muted-foreground">{item.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
