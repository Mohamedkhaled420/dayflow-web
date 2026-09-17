#!/usr/bin/env node
// ============================================================
// Unit tests for the coach AI reply pipeline (no framework —
// plain assert, node ≥22 with type stripping).
//   node scripts/test-coach-protocol.mjs
// ============================================================

import assert from "node:assert/strict";
import { renderCoachMarkdown } from "../src/lib/coach-markdown.ts";
import {
  parseCoachProtocol,
  ProtocolStreamFilter,
  coerceCoachAction,
  classifyProtocolLine,
} from "../src/lib/coach-protocol.ts";

let passed = 0;
const ok = (name) => {
  passed++;
  console.log(`  ✓ ${name}`);
};

// ------------------------------------------------------------
// renderCoachMarkdown
// ------------------------------------------------------------
console.log("renderCoachMarkdown");

{
  const html = renderCoachMarkdown("plain text, nothing fancy");
  assert.equal(html, "<p>plain text, nothing fancy</p>");
  ok("plain text → single paragraph");
}
{
  const html = renderCoachMarkdown("This is **very important** and *subtle*.");
  assert.ok(html.includes("<strong>very important</strong>"), html);
  assert.ok(html.includes("<em>subtle</em>"), html);
  ok("bold + italic markers become tags, not literal stars");
}
{
  const html = renderCoachMarkdown("***both at once***");
  assert.ok(html.includes("<strong><em>both at once</em></strong>"), html);
  ok("bold+italic triple marker");
}
{
  const html = renderCoachMarkdown("unclosed **bold stays literal");
  assert.ok(!html.includes("<strong>"), html);
  assert.ok(html.includes("**"), html);
  ok("unclosed marker stays literal (streaming-safe)");
}
{
  const html = renderCoachMarkdown("- alpha\n- beta\n1. one\n2. two");
  assert.ok(html.includes("<ul><li>alpha</li><li>beta</li></ul>"), html);
  assert.ok(html.includes("<ol><li>one</li><li>two</li></ol>"), html);
  ok("bulleted and ordered lists");
}
{
  const html = renderCoachMarkdown("### Heading text\nbody");
  assert.ok(html.includes("<h3>Heading text</h3>"), html);
  ok("headings render without hashes");
}
{
  const html = renderCoachMarkdown("> quoted wisdom\n\npara");
  assert.ok(html.includes("<blockquote>quoted wisdom</blockquote>"), html);
  ok("blockquotes");
}
{
  const html = renderCoachMarkdown("```\ncode line\n```");
  assert.ok(html.includes("<pre><code>code line</code></pre>"), html);
  ok("fenced code blocks");
}
{
  const html = renderCoachMarkdown("run `npm test` now");
  assert.ok(html.includes("<code>npm test</code>"), html);
  ok("inline code spans");
}
{
  const html = renderCoachMarkdown("see [docs](https://example.com/a?b=1) and [bad](javascript:alert(1))");
  assert.ok(html.includes('<a href="https://example.com/a?b=1"'), html);
  assert.ok(!html.includes('href="javascript'), html); // unsafe link stays literal TEXT, never an href
  assert.ok(html.includes("[bad](javascript:alert(1))"), html); // unsafe link left as literal text
  ok("links: safe scheme kept, javascript: left as text");
}
{
  const html = renderCoachMarkdown("<script>alert(1)</script> **ok**");
  assert.ok(!html.includes("<script>"), html);
  assert.ok(html.includes("&lt;script&gt;"), html);
  assert.ok(html.includes("<strong>ok</strong>"), html);
  ok("XSS: input fully escaped before any tag is produced");
}
{
  const html = renderCoachMarkdown("**bold with [link](https://x.io) inside**");
  assert.ok(html.includes("<strong>bold with "), html);
  assert.ok(html.includes('<a href="https://x.io"'), html);
  ok("links inside bold survive");
}
{
  const html = renderCoachMarkdown("snake_case and `code_with_under` stay");
  assert.ok(!html.includes("<em>"), html);
  ok("underscores in words/links never italicize");
}
{
  const html = renderCoachMarkdown("a\nb\n\nc");
  assert.ok(html.includes("a<br>b</p>"), html);
  assert.ok(html.includes("<p>c</p>"), html);
  ok("single newline → <br>, blank line → new paragraph");
}

// ------------------------------------------------------------
// parseCoachProtocol
// ------------------------------------------------------------
console.log("parseCoachProtocol");

{
  const r = parseCoachProtocol(
    "Body line.\nAnother line.\n\nNOTE: Walk 10 minutes after lunch\nLOG WATER: 500 ml\n"
  );
  assert.equal(r.text, "Body line.\nAnother line.");
  assert.equal(r.note, "Walk 10 minutes after lunch");
  assert.deepEqual(r.actions, [{ kind: "water", amountMl: 500 }]);
  ok("trailing NOTE + LOG WATER parsed, stripped from text");
}
{
  const r = parseCoachProtocol("Note that sleep matters a lot here.");
  assert.equal(r.note, null);
  assert.equal(r.text, "Note that sleep matters a lot here.");
  ok("mid-sentence 'Note that…' is NOT a protocol line");
}
{
  const r = parseCoachProtocol(
    "Intro.\n- a bullet\n- NOTE: this is a list item, not the protocol\n\nOutro paragraph."
  );
  assert.equal(r.note, null);
  ok("bulleted mid-reply NOTE is left in the text");
}
{
  const r = parseCoachProtocol(
    "Plan:\n\nLOG WORKOUT: Run · 30 min\nLOG SLEEP: 7 hours\nLOG JOURNAL: Kept the streak alive\n"
  );
  assert.deepEqual(r.actions[0], { kind: "workout", activity: "Run", durationMinutes: 30 });
  assert.deepEqual(r.actions[1], { kind: "sleep", durationMinutes: 420 });
  assert.deepEqual(r.actions[2], { kind: "journal", summary: "Kept the streak alive" });
  ok("workout/sleep(hours)/journal lines parse + clamp");
}
{
  const r = parseCoachProtocol("B.\n\nLOG WATER: two glasses");
  assert.equal(r.actions.length, 0); // non-numeric water dropped, never invented
  ok("unparseable water amount dropped (never invents logs)");
}
{
  const r = parseCoachProtocol("B.\n\nLOG SLEEP: 430 min");
  assert.deepEqual(r.actions, [{ kind: "sleep", durationMinutes: 430 }]);
  ok("sleep minutes form");
}
{
  const r = parseCoachProtocol("B.\n\nNOTE: one\nNOTE: two");
  assert.equal(r.note, "two");
  ok("duplicate NOTE lines → last one wins");
}

// ------------------------------------------------------------
// ProtocolStreamFilter — chunk-splitting torture tests
// ------------------------------------------------------------
console.log("ProtocolStreamFilter");

/** Feed text through the filter in fixed-size chunks. */
function stream(text, size) {
  const f = new ProtocolStreamFilter();
  let delta = "";
  const events = [];
  for (let i = 0; i < text.length; i += size) {
    const out = f.push(text.slice(i, i + size));
    delta += out.delta;
    events.push(...out.events);
  }
  const tail = f.finish();
  delta += tail.delta;
  events.push(...tail.events);
  return { delta, events, produced: f.produced };
}

{
  const text = "Hello **world**.\n\nNOTE: Take a walk\nLOG WATER: 500 ml\n";
  for (const size of [1, 2, 3, 5, 7, 13, 40]) {
    const { delta, events } = stream(text, size);
    assert.equal(delta.trimEnd(), "Hello **world**.", `size=${size}`);
    assert.equal(events.length, 2, `size=${size} → ${JSON.stringify(events)}`);
    assert.deepEqual(events[0], { type: "note", text: "Take a walk" });
    assert.deepEqual(events[1], { type: "action", action: { kind: "water", amountMl: 500 } });
  }
  ok("protocol stripped under every chunk split (1..40 chars)");
}
{
  // The full four-line tail — WATER/WORKOUT share the "W" prefix,
  // so the holdback scanner must try every candidate keyword (this
  // exact case leaked NOTE+WATER as chat text before the fix).
  const text =
    "Body.\n\nNOTE: Walk 10 minutes after lunch\nLOG WATER: 500 ml\nLOG WORKOUT: Walk · 10 min\nLOG SLEEP: 7 hours\nLOG JOURNAL: Walked it off\n";
  for (const size of [1, 2, 3, 4, 5, 8, 11, 17, 33]) {
    const { delta, events } = stream(text, size);
    assert.equal(delta.trimEnd(), "Body.", `size=${size} → ${JSON.stringify({ delta, events })}`);
    assert.equal(events.length, 5, `size=${size} events → ${JSON.stringify(events)}`);
    assert.deepEqual(events[0], { type: "note", text: "Walk 10 minutes after lunch" });
    assert.deepEqual(events[1], { type: "action", action: { kind: "water", amountMl: 500 } });
    assert.deepEqual(events[2], {
      type: "action",
      action: { kind: "workout", activity: "Walk", durationMinutes: 10 },
    });
    assert.deepEqual(events[3], { type: "action", action: { kind: "sleep", durationMinutes: 420 } });
    assert.deepEqual(events[4], {
      type: "action",
      action: { kind: "journal", summary: "Walked it off" },
    });
  }
  ok("full NOTE+WATER+WORKOUT+SLEEP+JOURNAL tail survives every chunk split");
}
{
  const text = "Note that sleep matters.\nSecond line.";
  const { delta, events } = stream(text, 3);
  assert.equal(delta.trimEnd(), text);
  assert.equal(events.length, 0);
  ok("'Note that…' body line streams through untouched");
}
{
  // NOTE held mid-stream, then body follows → flushed back as text.
  const text = "Intro line.\nNOTE: maybe trailing?\nBut more body arrives.\n";
  const { delta, events } = stream(text, 4);
  assert.ok(delta.includes("NOTE: maybe trailing?"), delta);
  assert.equal(events.length, 0);
  ok("held NOTE flushed back when body follows (mid-reply)");
}
{
  const text = "Only a NOTE today.\n\nNOTE: Rest your eyes for 20 seconds\n";
  const { delta, events } = stream(text, 5);
  assert.equal(delta.trimEnd(), "Only a NOTE today.");
  assert.deepEqual(events, [{ type: "note", text: "Rest your eyes for 20 seconds" }]);
  ok("blank line between body and protocol is held, not flashed");
}
{
  const text = "";
  const f = new ProtocolStreamFilter();
  const out = f.finish();
  assert.equal(out.delta, "");
  assert.equal(out.events.length, 0);
  assert.equal(f.produced, false);
  ok("empty stream → produced=false (route treats as empty hop)");
}
{
  const text = "just text, no newline at end";
  const { delta, events } = stream(text, 6);
  assert.equal(delta.trimEnd(), text);
  assert.equal(events.length, 0);
  ok("unterminated final body line flushes at finish()");
}
{
  // Chunk boundary INSIDE the think tag and markdown marker.
  const text = "Hi there. **bold** claim.\n\nNOTE: Ship it\n";
  for (const size of [1, 2, 4]) {
    const { delta, events } = stream(text, size);
    assert.equal(delta.trimEnd(), "Hi there. **bold** claim.", `size=${size}`);
    assert.deepEqual(events, [{ type: "note", text: "Ship it" }]);
  }
  ok("markdown body + trailing protocol under hostile splits");
}
{
  const { kind } = classifyProtocolLine("**NOTE:** decorated");
  assert.equal(kind, "note");
  const r = parseCoachProtocol("B.\n\n**NOTE:** decorated\n");
  assert.equal(r.note, "decorated");
  ok("decorated (**NOTE:**) lines recognized");
}

// ------------------------------------------------------------
// coerceCoachAction (client defense)
// ------------------------------------------------------------
console.log("coerceCoachAction");
{
  assert.deepEqual(coerceCoachAction({ kind: "water", amountMl: 500 }), { kind: "water", amountMl: 500 });
  assert.equal(coerceCoachAction({ kind: "water", amountMl: 999999 }), null);
  assert.equal(coerceCoachAction({ kind: "water", amountMl: "abc" }), null);
  assert.equal(coerceCoachAction({ kind: "nuke", anything: true }), null);
  assert.equal(coerceCoachAction(null), null);
  assert.deepEqual(coerceCoachAction({ kind: "workout", activity: "Run", durationMinutes: 30 }), {
    kind: "workout",
    activity: "Run",
    durationMinutes: 30,
  });
  ok("malformed/hostile action payloads rejected, valid ones pass");

  const long = coerceCoachAction({ kind: "journal", summary: "x".repeat(500) });
  assert.equal(long.summary.length, 300);
  ok("journal summary re-capped client-side");
}

console.log(`\n${passed} assertions passed.`);
