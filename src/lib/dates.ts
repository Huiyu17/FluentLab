/**
 * Human-friendly dates in the learner's time zone. Pure: pass `now` explicitly so pages
 * render consistently and tests are deterministic.
 */
import { dayKey, type DayKey } from "@/lib/domain/streak";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole calendar days from `from` to `to` (both `YYYY-MM-DD`). */
export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function format(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(date);
  }
}

/** "Good morning" / "Good afternoon" / "Good evening" for the learner's local hour. */
export function greeting(now: Date, timeZone: string): string {
  const hour = Number(format(now, timeZone, { hour: "numeric", hourCycle: "h23" }));
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

/** "Wednesday, October 28" */
export function longDate(now: Date, timeZone: string): string {
  return format(now, timeZone, { weekday: "long", month: "long", day: "numeric" });
}

/** A past moment: "Today", "Yesterday", "Monday" (within a week), else "Oct 12" / "Oct 12, 2025". */
export function pastDay(at: string | Date, now: Date, timeZone: string): string {
  const date = typeof at === "string" ? new Date(at) : at;
  const diff = daysBetween(dayKey(date, timeZone), dayKey(now, timeZone));
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return format(date, timeZone, { weekday: "long" });
  const sameYear = format(date, timeZone, { year: "numeric" }) === format(now, timeZone, { year: "numeric" });
  return format(date, timeZone, sameYear ? { month: "short", day: "numeric" } : { dateStyle: "medium" });
}

/** A future moment, phrased to follow a verb: "later today", "tomorrow", "on Friday", "on Nov 12". */
export function futureDay(at: string | Date, now: Date, timeZone: string): string {
  const date = typeof at === "string" ? new Date(at) : at;
  const diff = daysBetween(dayKey(now, timeZone), dayKey(date, timeZone));
  if (diff <= 0) return "later today";
  if (diff === 1) return "tomorrow";
  if (diff < 7) return `on ${format(date, timeZone, { weekday: "long" })}`;
  return `on ${format(date, timeZone, { month: "short", day: "numeric" })}`;
}
