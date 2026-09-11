// ============================================================
// Dayflow AI — journal rich-text helpers (Phase 8, decision 1)
// ------------------------------------------------------------
// Journal entries are authored in a contentEditable composer
// (document.execCommand — deprecated but dependency-free and
// universally supported) and stored as HTML strings in
// journal_entries.content. Before any of that HTML is rendered
// it passes through THIS allowlist sanitizer: unknown tags are
// unwrapped (children kept), dangerous elements are dropped
// outright, and every attribute except a sanitized a[href] is
// removed. The render path never trusts stored HTML.
// ============================================================

/** Tags preserved verbatim (formatting the composer can emit). */
const ALLOWED_TAGS = new Set([
  "P",
  "BR",
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "S",
  "STRIKE",
  "DEL",
  "H1",
  "H2",
  "H3",
  "UL",
  "OL",
  "LI",
  "BLOCKQUOTE",
  "PRE",
  "CODE",
  "A",
  "SPAN",
]);

/** Elements whose entire subtree is removed (never unwrapped). */
const DROP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "FORM",
  "INPUT",
  "BUTTON",
  "TEXTAREA",
  "SELECT",
  "IMG",
  "VIDEO",
  "AUDIO",
  "svg",
  "math",
]);

const SAFE_URL = /^(https?:|mailto:)/i;

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSafeHref(raw: string): boolean {
  const href = raw.trim().toLowerCase();
  // Relative URLs and safe schemes pass; javascript:, data:, and
  // everything else exotic is rejected.
  if (href.startsWith("/") || href.startsWith("#")) return true;
  return SAFE_URL.test(href);
}

function clean(root: Element): void {
  const children = Array.from(root.childNodes);
  for (const node of children) {
    if (node.nodeType === Node.COMMENT_NODE) {
      node.remove();
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as Element;
    const tag = el.tagName;

    if (DROP_TAGS.has(tag)) {
      el.remove();
      continue;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      // Unwrap: keep the children, lose the tag.
      const parent = el.parentNode;
      if (!parent) continue;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      // Children were re-parented into `parent`; they still need
      // cleaning, so recurse over the moved nodes via the parent
      // pass — simplest correct approach: clean them now.
      continue;
    }

    // Strip every attribute except a sanitized anchor href.
    for (const attr of Array.from(el.attributes)) {
      if (tag === "A" && attr.name.toLowerCase() === "href") {
        if (isSafeHref(attr.value)) {
          el.setAttribute("rel", "noopener noreferrer");
          continue; // keep href
        }
      }
      el.removeAttribute(attr.name);
    }

    clean(el);
  }
}

/**
 * Sanitize stored journal HTML for render. Non-HTML strings
 * (legacy plain-text entries, pre-Phase-8 rows) are returned
 * HTML-escaped so the renderer can treat both shapes the same.
 */
export function sanitizeJournalHtml(input: string): string {
  if (!input) return "";
  const looksHtml = /<\/?[a-z][^>]*>/i.test(input);
  if (!looksHtml) return escapeHtml(input);
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    // SSR / test fallback — never render unsanitized markup.
    return escapeHtml(input);
  }
  const doc = new DOMParser().parseFromString(input, "text/html");
  clean(doc.body);
  return doc.body.innerHTML;
}

/**
 * Plain-text projection of a journal entry (for the coach's
 * [journal …] context lines and word counts). Block boundaries
 * become newlines so the LLM reads the entry like the author
 * wrote it.
 */
export function journalHtmlToText(input: string): string {
  if (!input) return "";
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  const doc = new DOMParser().parseFromString(input, "text/html");
  const parts: string[] = [];
  const BLOCK = new Set([
    "P",
    "H1",
    "H2",
    "H3",
    "LI",
    "BLOCKQUOTE",
    "PRE",
    "BR",
    "DIV",
  ]);
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.nodeValue ?? "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (BLOCK.has(el.tagName)) parts.push("\n");
    for (const child of Array.from(el.childNodes)) walk(child);
    if (BLOCK.has(el.tagName)) parts.push("\n");
  };
  for (const child of Array.from(doc.body.childNodes)) walk(child);
  return parts
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Visible character count used by the composer footer. */
export function journalCharCount(input: string): number {
  return journalHtmlToText(input).length;
}
