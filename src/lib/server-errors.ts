// ============================================================
// Dayflow AI — server-side error capture (audit P0-4)
// ------------------------------------------------------------
// Appends a 'server' row to error_events from route catch
// blocks. Uses the caller's session when one exists (RLS allows
// inserting user_id = auth.uid()); without a session the row is
// dropped to console.error only — the service-role key is NOT
// used from routes that lack it, and no anon write path exists.
// Never throws: monitoring must not break the monitored path.
// ============================================================

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function captureServerError(
  scope: string,
  error: unknown,
  context?: Record<string, unknown>
): Promise<void> {
  const message =
    error instanceof Error ? `${scope}: ${error.message}` : `${scope}: ${String(error)}`;
  const stack = error instanceof Error ? (error.stack ?? undefined) : undefined;
  // Always land in the platform log too (Vercel log drains).
  console.error(message, stack ?? "");

  try {
    const cookieStore = await cookies();
    const client = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      }
    );
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return; // no session → console-only (by design)

    await client.from("error_events").insert({
      user_id: user.id,
      kind: "server",
      message: message.slice(0, 2000),
      stack: stack?.slice(0, 8000) ?? null,
      url: scope,
      context: context ?? {},
    });
  } catch {
    /* never throw from the monitor */
  }
}
