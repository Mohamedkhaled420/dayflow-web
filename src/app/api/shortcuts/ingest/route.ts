// ============================================================
// Dayflow AI — Apple Shortcuts ingest webhook (PRD §10.4)
// ------------------------------------------------------------
// Edge runtime (zero cold starts), native Request/Response objects
// only — NO node-fetch import. Auth is the Supabase Auth JWT the
// Shortcut carries in its Authorization header (no client-side
// secrets), verified by a stateless request-scoped @supabase/ssr
// client — the same per-request pattern src/middleware.ts uses.
//
// Writes hydration_logs / workout_logs / sleep_logs (metricType
// decides), then advances profiles.last_sync_timestamp so the PWA's
// next-boot delta sync pulls the ingested rows (PRD §2).
// ============================================================

import { createServerClient } from "@supabase/ssr";
import { z } from "zod";

export const runtime = "edge"; // native Request/Response — NO node-fetch

const IngestSchema = z
  .object({
    metricType: z.enum(["sleep_sync", "workout_sync", "hydration_tap"]),
    payload: z.object({
      sleepMinutes: z.number().positive().optional(),
      workoutType: z.string().min(1).optional(),
      volumeMl: z.number().positive().default(250),
    }),
  })
  .superRefine((value, ctx) => {
    // Metric-specific requirements — the PRD base schema allows these to
    // be optional, but the target columns are NOT NULL. Rejecting here
    // gives the Shortcut a precise 400 instead of a database error.
    if (value.metricType === "sleep_sync" && value.payload.sleepMinutes === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload", "sleepMinutes"],
        message: "sleepMinutes is required for sleep_sync",
      });
    }
    if (value.metricType === "workout_sync" && !value.payload.workoutType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload", "workoutType"],
        message: "workoutType is required for workout_sync",
      });
    }
  });

export async function POST(req: Request) {
  // 1. Auth: Supabase JWT from the Shortcut — NO client-side secrets.
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Stateless request-scoped verification client (Edge-safe; same env
  // precedence as the v0 helpers). getUser() sends the global
  // Authorization header as the bearer credential.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {}, // stateless verification — nothing to persist
      },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Invalid Session" }, { status: 401 });
  }

  try {
    const body = IngestSchema.parse(await req.json());
    const timestamp = new Date().toISOString();

    if (body.metricType === "hydration_tap") {
      const { error } = await supabase.from("hydration_logs").insert({
        user_id: user.id,
        amount_ml: body.payload.volumeMl,
        logged_at: timestamp,
      });
      if (error) throw new Error(error.message);
    } else if (body.metricType === "workout_sync") {
      const { error } = await supabase.from("workout_logs").insert({
        user_id: user.id,
        type: body.payload.workoutType,
        logged_at: timestamp,
      });
      if (error) throw new Error(error.message);
    } else {
      // sleep_sync — the PRD §10.4 sample enum accepts it but never
      // writes it; sleep_logs exists for exactly this metric.
      const { error } = await supabase.from("sleep_logs").insert({
        user_id: user.id,
        sleep_minutes: body.payload.sleepMinutes as number,
        logged_at: timestamp,
      });
      if (error) throw new Error(error.message);
    }

    // Delta Sync signal for the PWA (snake_case column).
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ last_sync_timestamp: timestamp })
      .eq("id", user.id);
    if (profileError) throw new Error(profileError.message);

    return Response.json({ success: true, timestamp }, { status: 200 });
  } catch (e: unknown) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Malformed Payload" },
      { status: 400 }
    );
  }
}

// Reject non-POST methods explicitly.
export function GET() {
  return Response.json({ error: "Method Not Allowed" }, { status: 405 });
}
