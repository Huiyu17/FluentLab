import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENGLISH_LEVELS, LEARNING_CONTEXTS } from "@/lib/validation/profile";
import {
  CustomScenarioSchema,
  SCENARIO_CATEGORIES,
  SCENARIO_LIMITS,
  customScenarioValues,
  toScenarioRow,
} from "@/lib/validation/scenario";

const VALID = {
  title: "Lab meeting update",
  description: "",
  userRole: "A first-year PhD student",
  aiRole: "My advisor, Dr. Chen",
  aiPersonality: "Kind but very busy",
  goal: "Explain that my experiment failed and ask for advice.",
  difficulty: "upper_intermediate",
  openingLine: "",
  estMinutes: "8",
};

describe("CustomScenarioSchema", () => {
  it("accepts a valid scenario, trims text and turns a blank opening line into null", () => {
    const parsed = CustomScenarioSchema.parse({ ...VALID, title: "  Lab meeting update  " });
    expect(parsed).toMatchObject({ title: "Lab meeting update", openingLine: null, estMinutes: 8 });
  });

  it("requires title, roles, goal, difficulty and length", () => {
    const result = CustomScenarioSchema.safeParse({
      ...VALID,
      title: " ",
      userRole: "",
      aiRole: "",
      goal: "",
      difficulty: "C1",
      estMinutes: "",
    });
    expect(result.success).toBe(false);
    const fields = new Set(result.error?.issues.map((issue) => issue.path[0]));
    expect(fields).toEqual(new Set(["title", "userRole", "aiRole", "goal", "difficulty", "estMinutes"]));
  });

  it("enforces every length limit", () => {
    const fields = {
      title: "title",
      description: "description",
      userRole: "userRole",
      aiRole: "aiRole",
      aiPersonality: "aiPersonality",
      goal: "goal",
      openingLine: "openingLine",
    } as const;
    for (const [field, limit] of Object.entries(SCENARIO_LIMITS)) {
      const key = fields[field as keyof typeof fields];
      expect(CustomScenarioSchema.safeParse({ ...VALID, [key]: "x".repeat(limit) }).success, field).toBe(
        true,
      );
      expect(CustomScenarioSchema.safeParse({ ...VALID, [key]: "x".repeat(limit + 1) }).success, field).toBe(
        false,
      );
    }
  });

  it("keeps the length between 1 and 60 minutes", () => {
    expect(CustomScenarioSchema.safeParse({ ...VALID, estMinutes: "0" }).success).toBe(false);
    expect(CustomScenarioSchema.safeParse({ ...VALID, estMinutes: "61" }).success).toBe(false);
    expect(CustomScenarioSchema.safeParse({ ...VALID, estMinutes: "7.5" }).success).toBe(false);
  });

  it("reads a form and maps to the columns learners may write", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries(VALID)) form.set(key, value);
    const row = toScenarioRow(CustomScenarioSchema.parse(customScenarioValues(form)));
    expect(row).toEqual({
      title: "Lab meeting update",
      description: "",
      user_role: "A first-year PhD student",
      ai_role: "My advisor, Dr. Chen",
      ai_personality: "Kind but very busy",
      goal: "Explain that my experiment failed and ask for advice.",
      difficulty: "upper_intermediate",
      opening_line: null,
      est_minutes: 8,
    });
    // Never ownership, sharing or prompt columns: those are set by the server or not at all.
    expect(Object.keys(row)).not.toContain("created_by");
    expect(Object.keys(row)).not.toContain("system_prompt");
  });
});

describe("matches the migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261028000200_scenarios_and_conversations.sql"),
    "utf8",
  );
  const table = sql.slice(
    sql.indexOf("create table public.scenarios"),
    sql.indexOf("create index scenarios_"),
  );

  it("uses the same length limits", () => {
    const columns = {
      title: "title",
      description: "description",
      userRole: "user_role",
      aiRole: "ai_role",
      aiPersonality: "ai_personality",
      goal: "goal",
      openingLine: "opening_line",
    } as const;
    for (const [field, column] of Object.entries(columns)) {
      const match = table.match(
        new RegExp(`\\n\\s*${column} text[^\\n]*char_length\\(${column}\\)[^\\n]*?(\\d+)\\)`),
      );
      expect(Number(match?.[1]), column).toBe(SCENARIO_LIMITS[field as keyof typeof SCENARIO_LIMITS]);
    }
  });

  it("uses the same categories and difficulties", () => {
    const quoted = (list: string) => [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(quoted(table.match(/category in \(([^)]*)\)/)?.[1] ?? "")).toEqual([...SCENARIO_CATEGORIES]);
    expect(SCENARIO_CATEGORIES.slice(0, -1)).toEqual([...LEARNING_CONTEXTS]);
    expect(quoted(table.match(/difficulty in \(([^)]*)\)/)?.[1] ?? "")).toEqual([...ENGLISH_LEVELS]);
  });
});
