import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const refresh = vi.fn();
vi.mock("next/cache", () => ({ refresh: () => refresh() }));
const requireUser = vi.fn();
vi.mock("@/lib/auth/dal", () => ({ requireUser: (next?: string) => requireUser(next) }));
const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

const { dismissGapAction, restoreGapAction } = await import("@/lib/actions/gaps");

const USER_ID = "8f6d2c1e-4b3a-4f5e-9a7b-1c2d3e4f5a6b";
const GAP_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const form = (gapId: string) => {
  const data = new FormData();
  data.set("gapId", gapId);
  return data;
};

function fake(opts: { updateError?: { code: string }; rpcError?: { code: string } } = {}) {
  const calls: unknown[][] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["update", "eq"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ error: opts.updateError ?? null }).then(resolve);
  const rpc = vi.fn(async () => ({ data: "active", error: opts.rpcError ?? null }));
  return { client: { from: () => builder, rpc }, calls, rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: USER_ID });
});

describe("gap actions", () => {
  it("dismisses only the learner's gap and refreshes", async () => {
    const f = fake();
    createClient.mockResolvedValue(f.client);
    await dismissGapAction(form(GAP_ID));
    expect(f.calls).toEqual([
      ["update", { status: "dismissed" }],
      ["eq", "id", GAP_ID],
      ["eq", "user_id", USER_ID],
    ]);
    expect(refresh).toHaveBeenCalled();
  });

  it("restores through restore_gap, treating a missing gap as done", async () => {
    const f = fake();
    createClient.mockResolvedValue(f.client);
    await restoreGapAction(form(GAP_ID));
    expect(f.rpc).toHaveBeenCalledWith("restore_gap", { p_gap_id: GAP_ID });

    createClient.mockResolvedValue(fake({ rpcError: { code: "P0002" } }).client);
    await expect(restoreGapAction(form(GAP_ID))).resolves.toBeUndefined();
    createClient.mockResolvedValue(fake({ rpcError: { code: "XX000" } }).client);
    await expect(restoreGapAction(form(GAP_ID))).rejects.toThrow(/restore/);
  });

  it("ignores malformed ids", async () => {
    const f = fake();
    createClient.mockResolvedValue(f.client);
    await dismissGapAction(form("nope"));
    await restoreGapAction(form("nope"));
    expect(f.calls).toEqual([]);
    expect(f.rpc).not.toHaveBeenCalled();
  });
});
