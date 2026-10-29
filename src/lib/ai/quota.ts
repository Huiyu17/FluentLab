import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AIError } from "./errors";
import type { Database } from "@/lib/supabase/types";

/**
 * Spends one of the signed-in user's daily AI calls via the atomic `consume_ai_quota()` RPC
 * (docs/DATABASE.md). Throws `rate_limited` at the limit. Call it before every AI request.
 */
export async function consumeAiQuota(supabase: SupabaseClient<Database>): Promise<void> {
  const { data, error } = await supabase.rpc("consume_ai_quota");
  if (error) {
    console.error("[ai] quota check failed", { code: error.code });
    throw new AIError("provider_down", "Quota check failed.", { cause: error });
  }
  if (!data?.[0]?.allowed) throw new AIError("rate_limited");
}
