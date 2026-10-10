// ============================================================
// Focus Triad — service-role Supabase client (server only)
// ------------------------------------------------------------
// Used exclusively by serverless routes that MUST write past
// RLS (the NOWPayments IPN webhook). Returns null when the key
// is not configured — callers degrade honestly instead of
// crashing. The key is NEVER exposed to the client bundle and
// this module must never be imported from a "use client" file.
// ============================================================

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

export function createServiceClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    cached = null;
    return cached;
  }
  cached = createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
