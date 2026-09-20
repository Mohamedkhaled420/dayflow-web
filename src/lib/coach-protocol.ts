// ============================================================
// Dayflow AI — coach reply protocol (notes + log actions)
// ------------------------------------------------------------
// Conversational coach replies (modes journal/coaching) end with
// machine-readable lines the ROUTE strips from the visible chat
// and re-emits as structured events:
//
//   NOTE: <one short, concrete next step>
//   LOG WATER: <amount> ml
//   LOG WORKOUT: <activity> · <duration> min
//   LOG SLEEP: <duration> min
//   LOG JOURNAL: <one-sentence summary>
//
// The NOTE line feeds the Coach Notes panel (the actionable
// takeaway lives OUTSIDE the chat box); the LOG lines become
// one-tap actions that write through the real Dayflow stores.
//
// This module is PURE (no DOM, no imports) so the SAME line
// classifier powers the non-streaming parser, the streaming
// filter, and the client-side coercion of received events —
// the three can never disagree about what a protocol line is.
// ============================================================

export type CoachLogKind = "water" | "workout" | "sleep" | "journal";

export interface CoachLogAction {
  kind: CoachLogKind;
  /** water — milliliters per log. */
  amountMl?: number;
  /** workout — activity name ("Run", "Walk", …). */
  activity?: string;
  /** workout / sleep — minutes. */
  durationMinutes?: number;
  /** journal — the sentence to save as an entry. */
  summary?: string;
}

export interface CoachProtocolResult {
  /** Chat text with every protocol line removed. */
  text: string;
  /** The actionable takeaway, when the coach emitted one. */
  note: string | null;
  /** Parsed, clamped, ready-to-apply log actions. */
  actions: CoachLogAction[];
}

/** SSE event payloads the route emits for parsed lines. */
export type CoachProtocolEvent =
  | { type: "note"; text: string }
  | { type: "action"; action: CoachLogAction };

// ---------- line classification (single source of truth) ----------

// Tolerates the decorations reasoning models sometimes wrap
// around the keyword (leading list marker / bold / heading) and
// full-width colons, but ONLY at the start of a line — body
// sentences like "note that sleep matters" never match because
// they lack the keyword-at-line-start + colon shape. A closing
// decoration is only consumed when it MIRRORS the opening one
// (backreference), so a genuine "*emphasized*" note body keeps
// its markers.
const PROTOCOL_LINE_RE =
  /^([#*_>~\-\s]{0,4})(NOTE|LOG\s*WATER|LOG\s*WORKOUT|LOG\s*SLEEP|LOG\s*JOURNAL)\s*[:：]\s*(?:\1)?\s*(.*)$/i;

export type ProtocolLineKind =
  | "note"
  | "log-water"
  | "log-workout"
  | "log-sleep"
  | "log-journal"
  | null;

export function classifyProtocolLine(
  line: string
): { kind: ProtocolLineKind; value: string } {
  const m = line.match(PROTOCOL_LINE_RE);
  if (!m) return { kind: null, value: line };
  // Group order: 1 = opening decoration, 2 = keyword, 3 = value.
  const keyword = m[2].toUpperCase().replace(/\s+/g, " ");
  const value = m[3].trim();
  switch (keyword) {
    case "NOTE":
      return { kind: "note", value };
    case "LOG WATER":
      return { kind: "log-water", value };
    case "LOG WORKOUT":
      return { kind: "log-workout", value };
    case "LOG SLEEP":
      return { kind: "log-sleep", value };
    case "LOG JOURNAL":
      return { kind: "log-journal", value };
    default:
      return { kind: null, value: line };
  }
}

/** True while `partial` could still grow into a protocol line
 *  (used to hold back the tail of a streaming line). Precise
 *  char-scanner, NOT a string-prefix check: "NOTE: your sleep…"
 *  must be held (it IS a protocol line in the making), while
 *  "Note that sleep matters" and "Long runs…" must flush the
 *  instant they diverge from the keyword shape. */
function couldBecomeProtocol(partial: string): boolean {
  let i = 0;
  // Leading decorations the classifier tolerates (max 4).
  let decor = 0;
  while (i < partial.length && decor < 4 && /[#*_>~\-\s]/.test(partial[i])) {
    i++;
    decor++;
  }
  if (i >= partial.length) return true; // decorations only — ambiguous
  const rest = partial.slice(i);
  if (rest === "") return true;

  const colonAt = (from: number): boolean => {
    let k = from;
    while (k < rest.length && /\s/.test(rest[k])) k++;
    if (k === rest.length) return true; // spaces so far — colon may come
    return rest[k] === ":" || rest[k] === "：";
  };

  // NOTE branch
  const noteKw = "NOTE";
  let j = 0;
  while (j < rest.length && j < noteKw.length && rest[j].toUpperCase() === noteKw[j]) j++;
  if (j > 0) {
    if (j === rest.length) return true; // partial keyword, still growing
    return j === noteKw.length ? colonAt(j) : false;
  }

  // LOG <KIND> branch
  const logKw = "LOG";
  let m = 0;
  while (m < rest.length && m < logKw.length && rest[m].toUpperCase() === logKw[m]) m++;
  if (m > 0) {
    if (m === rest.length) return true; // partial LOG
    if (m < logKw.length) return false;
    let k = m;
    while (k < rest.length && /\s/.test(rest[k])) k++;
    if (k === rest.length) return true;
    // Sub-keywords share prefixes (WATER / WORKOUT both start
    // "W") — a diverged candidate must NOT abort the scan; try
    // every candidate and hold only when one is still viable.
    for (const sub of ["WATER", "WORKOUT", "SLEEP", "JOURNAL"]) {
      let s = 0;
      while (k + s < rest.length && s < sub.length && rest[k + s].toUpperCase() === sub[s]) s++;
      if (s === 0) continue; // this candidate never started
      if (k + s === rest.length) return true; // partial — still growing
      if (s === sub.length && colonAt(k + s)) return true; // complete + colon
      // diverged mid-candidate — the next candidate may still fit
    }
    return false; // bare "LOG:" is not in the classifier — flush
  }
  return false; // not an N/L line start
}

// ---------- value parsing (clamped + defensive) ----------

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function parseWater(value: string): CoachLogAction | null {
  const m = value.match(/(\d{1,4})(?:[.,](\d{1,2}))?\s*(?:ml|mll|millilit\w*)?/i);
  if (!m) return null;
  const ml = clamp(parseInt(m[1], 10), 50, 3000);
  return { kind: "water", amountMl: ml };
}

function parseWorkout(value: string): CoachLogAction | null {
  // Preferred shape "Activity · 30 min"; tolerated "Activity, 30
  // minutes" / "Activity - 30m" / bare "Activity" / "30 min of X".
  const minMatch = value.match(/(\d{1,3})\s*(?:min(?:ute)?s?|m)\b/i);
  const minutes = minMatch ? clamp(parseInt(minMatch[1], 10), 1, 600) : undefined;
  let activity = value
    .replace(/(\d{1,3}(?:[.,]\d+)?)\s*(?:h(?:ours?|rs?)?)\b/gi, "")
    .replace(/(\d{1,3})\s*(?:min(?:ute)?s?|m)\b/gi, "")
    .replace(/[·|,\-–—:]+/g, " ")
    .replace(/\bof\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!activity) {
    // "45 min" with no activity word — keep it loggable
    return minutes ? { kind: "workout", activity: "Workout", durationMinutes: minutes } : null;
  }
  if (activity.length > 60) activity = activity.slice(0, 60).trim();
  return { kind: "workout", activity, durationMinutes: minutes };
}

function parseSleep(value: string): CoachLogAction | null {
  const hours = value.match(/(\d{1,2}(?:[.,]\d+)?)\s*(?:h|hr|hrs|hours?)\b/i);
  if (hours) {
    const mins = Math.round(parseFloat(hours[1].replace(",", ".")) * 60);
    return { kind: "sleep", durationMinutes: clamp(mins, 10, 960) };
  }
  const mins = value.match(/(\d{2,4})\s*(?:min(?:ute)?s?)?\b/i);
  if (!mins) return null;
  return { kind: "sleep", durationMinutes: clamp(parseInt(mins[1], 10), 10, 960) };
}

function parseJournal(value: string): CoachLogAction | null {
  const summary = value.trim().replace(/\s+/g, " ");
  if (!summary) return null;
  return { kind: "journal", summary: summary.slice(0, 300) };
}

function actionFromLine(kind: ProtocolLineKind, value: string): CoachLogAction | null {
  switch (kind) {
    case "log-water":
      return parseWater(value);
    case "log-workout":
      return parseWorkout(value);
    case "log-sleep":
      return parseSleep(value);
    case "log-journal":
      return parseJournal(value);
    default:
      return null;
  }
}

// ---------- full-text parser (non-streaming path) ----------

/**
 * Parse a COMPLETE coach reply: protocol lines are recognized only
 * in the trailing block (walking backwards from the end past blank
 * lines), so a mid-reply bulleted "Note: …" sentence is never
 * gutted from the conversation.
 */
export function parseCoachProtocol(input: string): CoachProtocolResult {
  const lines = input.split("\n");

  // Find where the trailing protocol block starts.
  let i = lines.length;
  while (i > 0) {
    const prev = lines[i - 1];
    if (prev.trim() === "") {
      i--;
      continue;
    }
    if (classifyProtocolLine(prev).kind !== null) {
      i--;
      continue;
    }
    break;
  }

  const noteLines: string[] = [];
  const actions: CoachLogAction[] = [];
  for (let j = i; j < lines.length; j++) {
    const { kind, value } = classifyProtocolLine(lines[j]);
    if (kind === "note") {
      if (value) noteLines.push(value.slice(0, 240));
    } else if (kind !== null) {
      const action = actionFromLine(kind, value);
      if (action) actions.push(action);
    }
    // blank separator lines are simply dropped
  }

  const text = lines.slice(0, i).join("\n").trimEnd();
  return {
    text,
    note: noteLines.length > 0 ? noteLines[noteLines.length - 1] : null,
    actions: actions.slice(0, 5),
  };
}

// ---------- streaming filter (SSE path) ----------

export interface FilterChunk {
  /** Visible text to emit as a delta this push (may be ""). */
  delta: string;
  /** Structured events parsed off completed protocol lines. */
  events: CoachProtocolEvent[];
}

/**
 * Stateful line filter for the streaming path. Visible body text
 * passes through immediately EXCEPT:
 *   - the trailing, not-yet-terminated line (held only while it
 *     could still grow into "NOTE:"/"LOG …", so the user never
 *     sees half a protocol keyword);
 *   - completed protocol lines (buffered; if body text follows,
 *     they were mid-reply after all and are flushed back as text).
 * finish() settles the tail: whatever is still held becomes
 * structured events (or text, when it never matched).
 */
export class ProtocolStreamFilter {
  private pending = "";
  private heldLines: string[] = [];
  private producedContent = false;

  push(chunk: string): FilterChunk {
    this.pending += chunk;
    const parts = this.pending.split("\n");
    this.pending = parts.pop() ?? "";
    return this.drain(parts, false);
  }

  finish(): FilterChunk {
    const parts = this.pending === "" ? [] : [this.pending];
    this.pending = "";
    return this.drain(parts, true);
  }

  /** True once ANY visible text or structured event was produced. */
  get produced(): boolean {
    return this.producedContent;
  }

  private drain(lines: string[], finishing: boolean): FilterChunk {
    let delta = "";
    const events: CoachProtocolEvent[] = [];

    for (const raw of lines) {
      const { kind, value } = classifyProtocolLine(raw);
      if (kind !== null) {
        this.heldLines.push(raw);
        continue;
      }
      // body line — anything held before it was mid-reply text
      if (this.heldLines.length > 0 && raw.trim() !== "") {
        delta += this.heldLines.join("\n") + "\n";
        this.heldLines = [];
      } else if (this.heldLines.length > 0) {
        // blank line while holding: could separate trailing
        // protocol lines — hold it too, ordered.
        this.heldLines.push(raw);
        continue;
      }
      delta += raw + "\n";
    }

    if (finishing) {
      // Held lines are the trailing protocol block.
      for (const held of this.heldLines) {
        const { kind, value } = classifyProtocolLine(held);
        if (kind === "note") {
          if (value) events.push({ type: "note", text: value.slice(0, 240) });
        } else if (kind !== null) {
          const action = actionFromLine(kind, value);
          if (action) events.push({ type: "action", action });
        }
      }
      this.heldLines = [];
    }

    // Holdback rule for the unterminated tail: emit it unless it
    // could still become a protocol keyword (avoids flashing
    // "NOT" / "LOG" fragments before the line completes). A
    // pending that can NEVER become protocol proves body text
    // follows the held lines — flush them back as chat text
    // (they were mid-reply, not the trailing block). Without
    // this, body streamed through the holdback path would never
    // un-hold an earlier line and finish() would misread it.
    if (!finishing && this.pending !== "" && !couldBecomeProtocol(this.pending)) {
      if (this.heldLines.length > 0) {
        delta += this.heldLines.join("\n") + "\n";
        this.heldLines = [];
      }
      delta += this.pending;
      this.pending = "";
    }

    if (delta !== "" || events.length > 0) this.producedContent = true;
    return { delta, events };
  }
}

// ---------- client-side coercion (defense in depth) ----------

/** Coerce an untrusted SSE/JSON action payload into a safe action,
 *  or null when it isn't one. Numbers are re-clamped, strings
 *  re-capped — the server already did this, the client repeats it. */
export function coerceCoachAction(input: unknown): CoachLogAction | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (raw.kind === "water") {
    const ml = Number(raw.amountMl);
    if (!Number.isFinite(ml) || ml < 50 || ml > 3000) return null;
    return { kind: "water", amountMl: Math.round(ml) };
  }
  if (raw.kind === "workout") {
    const activity = typeof raw.activity === "string" ? raw.activity.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    const mins = Number(raw.durationMinutes);
    const duration = Number.isFinite(mins) && mins > 0 && mins <= 600 ? Math.round(mins) : undefined;
    if (!activity && duration === undefined) return null;
    return { kind: "workout", activity: activity || "Workout", durationMinutes: duration };
  }
  if (raw.kind === "sleep") {
    const mins = Number(raw.durationMinutes);
    if (!Number.isFinite(mins) || mins < 10 || mins > 960) return null;
    return { kind: "sleep", durationMinutes: Math.round(mins) };
  }
  if (raw.kind === "journal") {
    const summary = typeof raw.summary === "string" ? raw.summary.trim().slice(0, 300) : "";
    if (!summary) return null;
    return { kind: "journal", summary };
  }
  return null;
}

/** Human label for an action ("Water · 500 ml"). */
export function coachActionLabel(a: CoachLogAction): string {
  switch (a.kind) {
    case "water":
      return `Water · ${a.amountMl ?? ""} ml`.trim();
    case "workout":
      return `Workout · ${a.activity ?? "Session"}${a.durationMinutes ? ` · ${a.durationMinutes} min` : ""}`;
    case "sleep":
      return `Sleep · ${Math.floor((a.durationMinutes ?? 0) / 60)}h ${a.durationMinutes! % 60}m`;
    case "journal":
      return `Journal · ${a.summary ?? ""}`;
  }
}
