"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ChartPoint = {
  /** Position in the history (x); dates can repeat when there are several reviews a day. */
  index: number;
  /** Short date in the learner's time zone, e.g. "Oct 29". */
  date: string;
  title: string;
  value: number;
};

type TooltipProps = { active?: boolean; payload?: { payload: ChartPoint }[]; label: string };

/** Hover card: text tokens only; the line's color carries no meaning beyond "this indicator". */
function PointTooltip({ active, payload, label }: TooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm">
      <p className="font-medium">
        {label} {point.value}
      </p>
      <p className="text-muted-foreground">
        {point.title} · {point.date}
      </p>
    </div>
  );
}

/**
 * One indicator over the learner's reviewed conversations: a small single-series line on the shared
 * 0–100 scale (small multiples instead of one five-color chart, so no color has to carry identity).
 * Decorative for screen readers: the page has the same numbers as text and as a table.
 */
export function IndicatorChart({ label, points }: { label: string; points: ChartPoint[] }) {
  // First and last date only: the hover tooltip gives every point's date.
  const ticks = [...new Set([points[0]?.index, points.at(-1)?.index].filter((i) => i !== undefined))];
  return (
    <div aria-hidden className="h-32 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="index"
            type="number"
            domain={["dataMin", "dataMax"]}
            ticks={ticks}
            tickFormatter={(index: number) => points.find((p) => p.index === index)?.date ?? ""}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 50, 100]}
            width={28}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={(props) => <PointTooltip {...(props as unknown as TooltipProps)} label={label} />}
            cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={{ r: 4, fill: "var(--color-primary)", stroke: "var(--color-card)", strokeWidth: 2 }}
            activeDot={{ r: 6, fill: "var(--color-primary)", stroke: "var(--color-card)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
