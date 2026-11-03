import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

const { getDebrief } = await import("@/lib/data/debriefs");
const { mockDebrief } = await import("@/lib/ai/fixtures/debrief");

const USER_ID = "8f6d2c1e-4b3a-4f5e-9a7b-1c2d3e4f5a6b";
const DEBRIEF_ID = "2b3c4d5e-6f70-4a8b-9c0d-1e2f3a4b5c6d";
type Call = [string, ...unknown[]];

function fake(row: unknown) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "maybeSingle"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: row, error: null }).then(resolve);
  return { client: { from: () => builder }, calls };
}

const row = (result: unknown) => ({
  id: DEBRIEF_ID,
  situation: "At the pharmacy",
  what_user_said: null,
  result,
  scenario_id: null,
  created_at: "2026-11-03T10:00:00Z",
});

beforeEach(() => vi.clearAllMocks());

describe("getDebrief", () => {
  it("returns the validated result and flags mock results as samples", async () => {
    const result = mockDebrief("<situation>At the pharmacy</situation>");
    const f = fake(row({ ...result, model: "mock/debrief-v1" }));
    createClient.mockResolvedValue(f.client);
    const debrief = await getDebrief(USER_ID, DEBRIEF_ID);
    expect(debrief).toMatchObject({ id: DEBRIEF_ID, whatYouSaid: null, sample: true, result });
    expect(f.calls).toContainEqual(["eq", "user_id", USER_ID]);

    createClient.mockResolvedValue(fake(row({ ...result, model: "gemini/debrief-v1" })).client);
    expect((await getDebrief(USER_ID, DEBRIEF_ID))?.sample).toBe(false);
  });

  it("returns null for a missing debrief, a malformed id or a stored result that no longer validates", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    createClient.mockResolvedValue(fake(null).client);
    expect(await getDebrief(USER_ID, DEBRIEF_ID)).toBeNull();
    expect(await getDebrief(USER_ID, "nope")).toBeNull();
    createClient.mockResolvedValue(fake(row({ model: "mock/debrief-v1", phrasings: [] })).client);
    expect(await getDebrief(USER_ID, DEBRIEF_ID)).toBeNull();
  });
});
