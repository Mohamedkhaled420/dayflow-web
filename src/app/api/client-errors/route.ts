// ============================================================
// Focus Triad — /api/client-errors (audit P0-4, in-house monitor)
// ------------------------------------------------------------
// Client-side errors (window.onerror, unhandledrejections, React
// error boundaries) land here and are appended to error_events
// with the CALLER's own session (RLS insert-own policy — no
// service key needed, no anonymous spam surface).
//
// Privacy stance: message + stack + URL only, never payloads.
// The client batches and caps; this route validates hard:
//   - kind ∈ {client}
//   - message ≤ 2000 chars, stack ≤ 8000
//   - ≤ 10 events per POST
//   - 429 after 30 events / 5 min per user (durable limiter)
// ============================================================

import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { allowRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";

const EVENT_RULE = { bucket: "client-errors", limit: 30, windowSeconds: 300 };

const EventSchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  url: z.string().max(500).optional(),
  context: z.record(z.unknown()).optional(),
});

const BodySchema = z.object({
  kind: z.literal("client"),
  events: z.array(EventSchema).min(1).max(10),
});

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");

  // The user's own cookie session both authenticates AND
  // authorizes the RLS insert — signed-out visitors are simply
  // not captured (by design: nothing to correlate them with).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ ok: false, reason: "no-session" }, { status: 401 });
  }

  if (!(await allowRequest(EVENT_RULE, authHeader))) {
    return Response.json({ ok: false, reason: "rate-limited" }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, reason: "invalid" }, { status: 400 });
  }

  const ua = (req.headers.get("user-agent") ?? "").slice(0, 300);
  const rows = parsed.data.events.map((e) => ({
    user_id: user.id,
    kind: "client" as const,
    message: e.message.slice(0, 2000),
    stack: e.stack?.slice(0, 8000) ?? null,
    url: e.url?.slice(0, 500) ?? null,
    user_agent: ua,
    context: (e.context ?? {}) as Record<string, unknown>,
  }));

  const { error } = await supabase.from("error_events").insert(rows);
  if (error) {
    console.warn("[client-errors] insert failed:", error.message);
    return Response.json({ ok: false }, { status: 503 });
  }
  return Response.json({ ok: true, stored: rows.length });
}

export function GET() {
  return Response.json({ error: "Method Not Allowed" }, { status: 405 });
}
