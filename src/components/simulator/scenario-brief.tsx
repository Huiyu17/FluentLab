import { ArrowLeft, Clock, MessageCircle, Target, User, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SavedItem } from "@/lib/data/items";
import type { Scenario } from "@/lib/data/scenarios";
import { itemHref } from "@/lib/items";
import { SCENARIO_CATEGORY_LABELS } from "@/lib/scenarios";
import { ENGLISH_LEVEL_LABELS } from "@/lib/validation/profile";

function Block({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl border bg-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        <span aria-hidden className="text-primary">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Scenario brief: who you are, who you're talking to, your goal, and what to try using. */
export function ScenarioBrief({
  scenario,
  targets,
  actions,
}: {
  scenario: Scenario;
  targets: SavedItem[];
  /** Owner controls for custom scenarios (edit, delete). */
  actions?: ReactNode;
}) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link
        href="/simulator"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Real-Life Simulator
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[60ch] flex-col gap-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {SCENARIO_CATEGORY_LABELS[scenario.category]}
          </p>
          <h1 className="font-serif text-[2rem] leading-10 font-semibold tracking-tight">{scenario.title}</h1>
          {scenario.description && <p className="text-muted-foreground">{scenario.description}</p>}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>{ENGLISH_LEVEL_LABELS[scenario.difficulty].label}</span>
            <span aria-hidden>·</span>
            <span className="flex items-center gap-1">
              <Clock aria-hidden className="size-4" />
              About {scenario.estMinutes} min
            </span>
          </p>
        </div>
        {actions}
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Block icon={<User className="size-4" />} title="You are">
          <p>{scenario.userRole}</p>
        </Block>
        <Block icon={<Users className="size-4" />} title="You're talking to">
          <p>{scenario.aiRole}</p>
          {scenario.aiPersonality && (
            <p className="text-sm text-muted-foreground">{scenario.aiPersonality}</p>
          )}
        </Block>
      </div>

      <section className="flex flex-col gap-2 rounded-2xl bg-primary-soft p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-primary uppercase">
          <Target aria-hidden className="size-4" />
          Your goal
        </h2>
        <p className="text-lg">{scenario.goal}</p>
      </section>

      <Block icon={<MessageCircle className="size-4" />} title="How it starts">
        {scenario.openingLine ? (
          <blockquote className="border-l-2 border-primary pl-3 italic">
            &ldquo;{scenario.openingLine}&rdquo;
          </blockquote>
        ) : (
          <p className="text-muted-foreground">They&apos;ll open the conversation.</p>
        )}
      </Block>

      <section aria-labelledby="targets-title" className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
        <div className="flex flex-col gap-1">
          <h2 id="targets-title" className="font-semibold">
            Expressions you could use
          </h2>
          <p className="text-sm text-muted-foreground">
            From My English: what&apos;s due for review or still new to you. Use them if they fit; nobody will
            check.
          </p>
        </div>
        {targets.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {targets.map((item) => (
              <li key={item.id}>
                <Link
                  href={itemHref(item.type, item.id)}
                  className="flex flex-col rounded-lg px-3 py-2 transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="font-medium">{item.expression}</span>
                  <span className="line-clamp-1 text-sm text-muted-foreground">{item.meaning}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Save expressions in the{" "}
            <Link href="/expressions" className="font-medium text-primary underline-offset-4 hover:underline">
              Expression Studio
            </Link>{" "}
            and they&apos;ll show up here as things to try.
          </p>
        )}
      </section>

      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Stay in the moment: there are no corrections during the conversation. You get a full review when you
          finish.
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <Badge variant="outline" className="rounded-full bg-card">
            Coming in M6
          </Badge>
          <Button disabled aria-describedby="start-note">
            Start conversation
          </Button>
          <span id="start-note" className="sr-only">
            Starting conversations is coming in the next update.
          </span>
        </div>
      </div>
    </div>
  );
}
