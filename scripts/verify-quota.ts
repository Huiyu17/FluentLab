/**
 * Checks consume_ai_quota() under truly concurrent requests on the real Supabase project:
 * a throwaway user fires (daily limit + 10) calls at once; exactly `limit` must be allowed and
 * the stored count must equal the limit. Deletes the user afterwards. No AI provider is called.
 *
 *   npm run db:verify-quota
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !anonKey || !serviceRoleKey) {
  console.error(
    "Missing env. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient<Database>(url, serviceRoleKey, options);

const { data: config, error: configError } = await admin.from("app_config").select("ai_daily_limit").single();
if (configError || !config) {
  console.error("Could not read app_config.ai_daily_limit:", configError?.message);
  process.exit(1);
}
const limit = config.ai_daily_limit;
const attempts = limit + 10;

const email = `quota-check-${randomBytes(6).toString("hex")}@example.com`;
const password = randomBytes(18).toString("base64url");
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) {
  console.error("createUser failed:", created.error.message);
  process.exit(1);
}
const userId = created.data.user.id;

let ok = false;
try {
  const client = createClient<Database>(url, anonKey, options);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(`signIn: ${signedIn.error.message}`);

  const started = Date.now();
  const results = await Promise.all(Array.from({ length: attempts }, () => client.rpc("consume_ai_quota")));
  const errors = results.filter((r) => r.error);
  const allowed = results.filter((r) => r.data?.[0]?.allowed === true).length;
  const counts = results.flatMap((r) => (r.data?.[0]?.allowed ? [r.data[0].calls] : []));

  const { data: usage } = await admin.from("ai_usage").select("calls").eq("user_id", userId);
  const stored = usage?.reduce((sum, row) => sum + row.calls, 0) ?? 0;

  console.log(`${attempts} concurrent calls in ${Date.now() - started} ms (daily limit ${limit})`);
  console.log(
    `  allowed: ${allowed}, denied: ${attempts - allowed - errors.length}, errors: ${errors.length}`,
  );
  console.log(`  stored calls: ${stored}`);
  const distinct = new Set(counts).size === counts.length;
  ok = errors.length === 0 && allowed === limit && stored === limit && distinct;
  console.log(ok ? "✓ Exactly the limit was allowed, each with its own count." : "✗ Quota check failed.");
} finally {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) console.error(`Cleanup failed for ${userId}: ${error.message}`);
}
process.exit(ok ? 0 : 1);
