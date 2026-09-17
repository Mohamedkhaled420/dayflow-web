// ============================================================
// Dayflow AI — coach markdown renderer (zero dependencies)
// ------------------------------------------------------------
// Coach replies arrive as plain-text markdown (**bold**, lists,
// headings, `code`). Before this module the chat rendered them
// verbatim, so users saw literal asterisks ("stars") and hashes.
// This renderer converts a SAFE subset of that markdown to HTML:
//
//   # / ## / ### headings      → <h2>/<h3>
//   - / * / + bullets          → <ul><li>
//   1. ordered items           → <ol><li>
//   > quotes                   → <blockquote>
//   --- / *** / ___ rules      → <hr>
//   ``` fenced blocks          → <pre><code>
//   **bold** __bold__          → <strong>
//   *italic* _italic_          → <em>
//   `code`                     → <code>
//   [text](https://…) links    → <a> (http/https/mailto ONLY)
//
// SECURITY (non-negotiable): the input is HTML-escaped FIRST;
// every tag in the output is produced by this file from that
// escaped text, so no attacker-controlled markup can ever reach
// dangerouslySetInnerHTML. Link hrefs pass a scheme allowlist and
// are attribute-escaped. Pairs with the .df-prose CSS layer.
//
// Streaming-friendly: unclosed markers (`**bold` mid-stream) stay
// literal and resolve once the closing marker arrives, because
// the whole partial string is re-rendered on every paint.
// ============================================================

/** Escape everything that could start or end an HTML token. */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

/** Attribute-safe href for the allowlisted schemes (input is
 *  ALREADY text-escaped — quotes arrive as &quot;). */
function safeHref(raw: string): string | null {
  const href = raw.trim();
  return SAFE_LINK.test(href) ? href : null;
}

// ---------- inline formatting ----------
// Code spans and links are extracted to placeholders FIRST so
// emphasis rules can never mangle their contents; emphasis then
// runs on the plain remainder; placeholders are restored last.

interface Slot {
  html: string;
}

function renderInline(escaped: string): string {
  const slots: Slot[] = [];
  const park = (html: string): string => {
    slots.push({ html });
    return `\u0000${slots.length - 1}\u0000`;
  };

  let text = escaped;

  // 1. code spans — highest priority, content verbatim
  text = text.replace(/`([^`\n]+)`/g, (_m, code: string) => park(`<code>${code}</code>`));

  // 2. markdown links [label](url) — allowlisted schemes only
  text = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, label: string, url: string) => {
    const href = safeHref(url);
    if (!href) return m; // not a safe link — leave the text as typed
    return park(`<a href="${href}" rel="noopener noreferrer" target="_blank">${label}</a>`);
  });

  // 3. emphasis on what remains (bold+italic → bold → italic)
  text = text.replace(/\*\*\*([^*\n]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  text = text.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  // Single-char emphasis: require a non-space inner and (for _)
  // word-boundary discipline so snake_case stays intact.
  text = text.replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, "<em>$1</em>");
  text = text.replace(/(?<![\w_])_([^_\n]+)_(?![\w_])/g, "<em>$1</em>");

  // 4. restore parked content
  text = text.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => {
    const slot = slots[Number(i)];
    return slot ? slot.html : "";
  });
  return text;
}

// ---------- block formatting ----------

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const UL_RE = /^[-*+]\s+(.*)$/;
const OL_RE = /^\d{1,3}[.)]\s+(.*)$/;
// The input arrives HTML-ESCAPED, so the blockquote marker is the
// entity form at line start.
const QUOTE_RE = /^(?:&gt;|>)\s?(.*)$/;
const HR_RE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;

/** Render markdown to sanitized HTML for a coach bubble. */
export function renderCoachMarkdown(src: string): string {
  if (!src) return "";
  const escaped = escapeHtml(src);
  const lines = escaped.split("\n");

  const out: string[] = [];
  let para: string[] = [];
  let quote: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let fence: string[] | null = null;

  const flushPara = () => {
    if (para.length === 0) return;
    out.push(`<p>${renderInline(para.join("<br>"))}</p>`);
    para = [];
  };
  const flushQuote = () => {
    if (quote.length === 0) return;
    out.push(`<blockquote>${renderInline(quote.join("<br>"))}</blockquote>`);
    quote = [];
  };
  const flushList = () => {
    if (!list) return;
    const tag = list.ordered ? "ol" : "ul";
    out.push(
      `<${tag}>${list.items.map((i) => `<li>${renderInline(i)}</li>`).join("")}</${tag}>`
    );
    list = null;
  };
  const flushAll = () => {
    flushPara();
    flushQuote();
    flushList();
  };

  for (const line of lines) {
    // fenced code block toggle
    if (/^```/.test(line.trim())) {
      if (fence !== null) {
        out.push(`<pre><code>${fence.join("\n")}</code></pre>`);
        fence = null;
      } else {
        flushAll();
        fence = [];
      }
      continue;
    }
    if (fence !== null) {
      fence.push(line);
      continue;
    }

    const trimmed = line.trim();

    if (trimmed === "") {
      flushAll();
      continue;
    }

    const heading = trimmed.match(HEADING_RE);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      out.push(
        level <= 1
          ? `<h2>${renderInline(heading[2].trim())}</h2>`
          : `<h3>${renderInline(heading[2].trim())}</h3>`
      );
      continue;
    }

    if (HR_RE.test(trimmed)) {
      flushAll();
      out.push("<hr>");
      continue;
    }

    const quoted = trimmed.match(QUOTE_RE);
    if (quoted) {
      flushPara();
      flushList();
      quote.push(quoted[1]);
      continue;
    }

    const ul = trimmed.match(UL_RE);
    if (ul) {
      flushPara();
      flushQuote();
      if (!list || list.ordered) {
        flushList(); // a ul after an ol flushes it — both render
        list = { ordered: false, items: [] };
      }
      list.items.push(ul[1]);
      continue;
    }

    const ol = trimmed.match(OL_RE);
    if (ol) {
      flushPara();
      flushQuote();
      if (!list || !list.ordered) {
        flushList(); // an ol after a ul flushes it — both render
        list = { ordered: true, items: [] };
      }
      list.items.push(ol[1]);
      continue;
    }

    // plain text — merges into the current paragraph (single
    // newlines become <br>, blank lines split paragraphs)
    flushQuote();
    flushList();
    para.push(trimmed);
  }

  // unterminated fence closes at end-of-text
  if (fence !== null) out.push(`<pre><code>${fence.join("\n")}</code></pre>`);
  flushAll();

  return out.join("");
}
