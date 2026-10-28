import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Runs the real migrations on PGlite (Postgres compiled to WASM) with a
 * minimal stand-in for the Supabase environment: the `auth` schema,
 * `auth.uid()`, and the `anon` / `authenticated` roles.
 *
 * This verifies SQL validity, constraints, RLS policies and grants under
 * Postgres semantics. It is NOT a Supabase instance: Supabase's own default
 * privileges, auth service and PostgREST are not exercised here.
 */
const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated;
  -- Mimic Supabase: broad default grants on public that migrations must revoke.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

export async function createTestDb(options: { seed?: boolean } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of migrationFiles()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  if (options.seed) {
    await db.exec(readFileSync(path.join(ROOT, "supabase", "seed.sql"), "utf8"));
  }
  return db;
}

/** Create an auth user (the profile is created by the on_auth_user_created trigger). */
export async function createUser(db: PGlite, id: string, displayName = "Test"): Promise<void> {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    `${id}@example.test`,
    JSON.stringify({ display_name: displayName }),
  ]);
}

/**
 * Run `fn` as an authenticated user (or anon when userId is null), inside a
 * transaction that is always rolled back, so tests don't leak state.
 */
export async function asUser<T>(
  db: PGlite,
  userId: string | null,
  fn: (tx: Pick<PGlite, "query" | "exec">) => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  let failure: unknown;
  await db.exec("begin");
  try {
    await db.exec(userId ? "set local role authenticated" : "set local role anon");
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    result = await fn(db);
  } catch (error) {
    failure = error;
  } finally {
    await db.exec("rollback");
  }
  if (failure !== undefined) throw failure;
  return result as T;
}

/** Run as the table owner (bypasses RLS), e.g. to simulate a security definer RPC. */
export async function asOwner<T>(db: PGlite, fn: (tx: Pick<PGlite, "query" | "exec">) => Promise<T>) {
  return fn(db);
}
