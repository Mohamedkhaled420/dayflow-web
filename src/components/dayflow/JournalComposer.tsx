"use client";

// ============================================================
// Dayflow AI — Journal rich-text composer (Phase 8, decision 1
// — 2026-09 glow + progressive toolbar rework)
// ------------------------------------------------------------
// Full-featured entry editor for the Journal view, powered by
// document.execCommand (deprecated but dependency-free and
// supported by every target browser). Output HTML is stored via
// addJournalEntry and ALWAYS re-rendered through
// sanitizeJournalHtml().
//
// 2026-09 rework:
//   GLOW — the composer lights up the moment the user starts
//   typing (user-requested): a focus ring while empty-focused,
//   and a full accent glow (ring + halo + gentle breathe) once
//   there is content. Rides .df-composer* classes in globals.css
//   (compositor-friendly: the breathe animates a pseudo-element's
//   opacity only).
//   PROGRESSIVE TOOLBAR — the 16 formatting controls collapsed
//   out of sight until the composer is focused (grid-template-
//   rows 0fr -> 1fr, no CLS). Idle state reads as a clean chat
//   box instead of a wall of tiny buttons.
//
// Fullscreen mode is an immersive surface: it requests the
// mobile dock to hide (Rule B, useDockHideRequest) and floats
// above sheets (z-70), below toasts (z-100).
// ============================================================

import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import { useDockHideRequest } from "@/hooks/use-dock-visibility";
import { journalHtmlToText } from "@/lib/journal-html";

interface JournalComposerProps {
  /** Current draft (HTML). */
  value: string;
  onChange: (html: string) => void;
  /** ⌘/Ctrl+Enter — save the entry. */
  onSubmit: () => void;
  placeholder?: string;
  ariaLabel?: string;
}

interface ToolDef {
  label: string;
  command: string;
  value?: string;
  Icon: typeof Bold;
}

const HISTORY_TOOLS: ToolDef[] = [
  { label: "Undo", command: "undo", Icon: Undo2 },
  { label: "Redo", command: "redo", Icon: Redo2 },
];

const INLINE_TOOLS: ToolDef[] = [
  { label: "Bold", command: "bold", Icon: Bold },
  { label: "Italic", command: "italic", Icon: Italic },
  { label: "Underline", command: "underline", Icon: Underline },
  { label: "Strikethrough", command: "strikeThrough", Icon: Strikethrough },
];

const BLOCK_TOOLS: ToolDef[] = [
  { label: "Heading 1", command: "formatBlock", value: "<h1>", Icon: Heading1 },
  { label: "Heading 2", command: "formatBlock", value: "<h2>", Icon: Heading2 },
  { label: "Heading 3", command: "formatBlock", value: "<h3>", Icon: Heading3 },
  { label: "Bullet list", command: "insertUnorderedList", Icon: List },
  { label: "Numbered list", command: "insertOrderedList", Icon: ListOrdered },
  { label: "Quote", command: "formatBlock", value: "<blockquote>", Icon: Quote },
  { label: "Code block", command: "formatBlock", value: "<pre>", Icon: Code },
];

export function JournalComposer({
  value,
  onChange,
  onSubmit,
  placeholder = "How did today go?",
  ariaLabel = "Journal entry",
}: JournalComposerProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  // The editor owns the DOM; React only pushes EXTERNAL resets
  // (post-save clears, preset chips) — never a value it just
  // emitted, which would reset the caret on every keystroke.
  const lastEmitted = useRef<string>(value);
  const [fullscreen, setFullscreen] = useState(false);
  const [stats, setStats] = useState({ words: 0, chars: 0 });
  // Glow ladder: focused (ring) -> typing (full glow + breathe).
  const [focused, setFocused] = useState(false);

  useDockHideRequest("editor-fullscreen", fullscreen);

  const refreshStats = () => {
    const text = editorRef.current
      ? journalHtmlToText(editorRef.current.innerHTML)
      : "";
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    setStats({ words, chars: text.length });
  };

  const emit = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    lastEmitted.current = html;
    onChange(html);
    refreshStats();
  };

  // Mount: adopt the incoming draft once.
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = value;
      refreshStats();
    }
  }, []);

  // External value change (save-clear / preset) → resync DOM.
  useEffect(() => {
    if (value !== lastEmitted.current && editorRef.current) {
      editorRef.current.innerHTML = value;
      lastEmitted.current = value;
      refreshStats();
    }
  }, [value]);

  const exec = (tool: ToolDef) => {
    editorRef.current?.focus();
    document.execCommand(tool.command, false, tool.value);
    emit();
  };

  const insertLink = () => {
    const url = window.prompt("Link URL", "https://");
    if (!url) return;
    editorRef.current?.focus();
    document.execCommand("createLink", false, url);
    emit();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSubmit();
    }
    if (e.key === "Escape" && fullscreen) {
      e.preventDefault();
      setFullscreen(false);
    }
  };

  const empty = stats.chars === 0;
  const typing = !empty;
  const glowClass = typing
    ? "df-composer df-composer-typing"
    : focused
      ? "df-composer df-composer-focus"
      : "df-composer";

  const toolbar = (
    <div
      className="df-composer-toolbar"
      role="toolbar"
      aria-label="Formatting"
    >
      <div>
        <div
          className="flex flex-wrap items-center gap-0.5 px-2 py-1.5"
          style={{ borderBottom: "0.5px solid var(--df-chip-border)" }}
        >
          {[...HISTORY_TOOLS, ...INLINE_TOOLS, ...BLOCK_TOOLS].map((tool) => (
            <button
              key={tool.label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec(tool)}
              aria-label={tool.label}
              title={tool.label}
              className="df-press grid h-7 w-7 place-items-center rounded-md"
              style={{ color: "var(--df-text-secondary)" }}
            >
              <tool.Icon className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          ))}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={insertLink}
            aria-label="Insert link"
            title="Insert link"
            className="df-press grid h-7 w-7 place-items-center rounded-md"
            style={{ color: "var(--df-text-secondary)" }}
          >
            <Link2 className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <span
            className="mx-1 hidden h-4 w-px sm:block"
            style={{ background: "var(--df-chip-border)" }}
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            aria-label={fullscreen ? "Exit fullscreen editor" : "Expand editor to fullscreen"}
            title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
            aria-pressed={fullscreen}
            className="df-press ml-auto grid h-7 w-7 place-items-center rounded-md"
            style={{ color: "var(--df-text-secondary)" }}
          >
            {fullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" strokeWidth={2} />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" strokeWidth={2} />
            )}
          </button>
        </div>
      </div>
    </div>
  );

  const canvas = (
    <div className="relative flex-1">
      {empty && (
        <p
          className="pointer-events-none absolute left-3 top-2.5 text-[13px] leading-relaxed"
          style={{ color: "var(--df-text-muted)" }}
          aria-hidden="true"
        >
          {placeholder}
        </p>
      )}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        spellCheck
        onInput={emit}
        onBlur={emit}
        onFocus={() => setFocused(true)}
        onKeyDown={onKeyDown}
        className="df-prose min-h-[84px] flex-1 px-3 py-2.5 text-[13px] leading-relaxed outline-none"
        style={{ color: "var(--df-text-primary)", overflowY: "auto" }}
      />
    </div>
  );

  const statusBar = (
    <div
      className="flex items-center justify-between px-3 py-1.5 text-[10px]"
      style={{ borderTop: "0.5px solid var(--df-chip-border)", color: "var(--df-text-muted)" }}
    >
      <span className="tabular-nums">
        {stats.words} {stats.words === 1 ? "word" : "words"} · {stats.chars} characters
      </span>
      <span className="hidden sm:inline">⌘↵ saves the entry</span>
    </div>
  );

  const card = (
    <div
      className={`relative flex flex-col overflow-hidden transition-shadow ${
        fullscreen ? "h-full" : ""
      } ${glowClass}`}
      onBlur={(e) => {
        // Focus leaves the whole card (not just moves between its
        // own children) → drop the ring.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false);
      }}
      style={{
        background: "var(--df-input-fill)",
        /* Lively Pastel control radius — the soft 16px well (a
           rich-text editor cannot be a full pill; this is the
           control-tier signature). */
        borderRadius: "var(--df-radius-control)",
      }}
    >
      {toolbar}
      {canvas}
      {statusBar}
    </div>
  );

  if (fullscreen) {
    return (
      <div
        className="fixed inset-0 z-[70] flex flex-col p-3 sm:p-6"
        style={{ background: "var(--background)" }}
        role="dialog"
        aria-label="Fullscreen journal editor"
        aria-modal="true"
      >
        <div className="mx-auto flex h-full w-full max-w-2xl flex-col">{card}</div>
      </div>
    );
  }

  return card;
}
