/**
 * Practice streak, counted in the learner's own time zone.
 *
 * A day counts as practiced when the learner finished a conversation, reviewed a saved item or
 * wrote a debrief (the caller decides which timestamps to pass). Today not being practiced yet
 * doesn't break the streak; a missed yesterday does.
 */

/** Calendar date in the learner's time zone, formatted `YYYY-MM-DD`. */
export type DayKey = string;

export type StreakDay = {
  day: DayKey;
  /** Short weekday name, e.g. "Mon". */
  label: string;
  practiced: boolean;
  isToday: boolean;
};

export type StreakSummary = {
  /** Consecutive practiced days ending today, or yesterday if today isn't practiced yet. */
  current: number;
  practicedToday: boolean;
  /** The last 7 days, oldest first, ending today. */
  week: StreakDay[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The calendar day `date` falls on in `timeZone`. Unknown time zones fall back to UTC. */
export function dayKey(date: Date, timeZone: string): DayKey {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: isValidTimeZone(timeZone) ? timeZone : "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Calendar arithmetic on day keys (no time zone or DST involved). */
export function addDays(day: DayKey, days: number): DayKey {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, date) + days * DAY_MS).toISOString().slice(0, 10);
}

function weekdayLabel(day: DayKey): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

export function summarizeStreak(
  activity: Iterable<Date | string>,
  now: Date,
  timeZone: string,
): StreakSummary {
  const practiced = new Set<DayKey>();
  for (const at of activity) {
    const date = typeof at === "string" ? new Date(at) : at;
    if (!Number.isNaN(date.getTime())) practiced.add(dayKey(date, timeZone));
  }

  const today = dayKey(now, timeZone);
  const practicedToday = practiced.has(today);

  let current = 0;
  for (let day = practicedToday ? today : addDays(today, -1); practiced.has(day); day = addDays(day, -1)) {
    current += 1;
  }

  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    return { day, label: weekdayLabel(day), practiced: practiced.has(day), isToday: day === today };
  });

  return { current, practicedToday, week };
}
