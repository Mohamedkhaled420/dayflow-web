// ============================================================
// Dayflow Coach Text Utilities — Render-time sanitization
// ------------------------------------------------------------
// Strips reasoning/think blocks from AI coach responses at render time.
// This provides a safety net for:
// 1. Legacy localStorage data saved BEFORE think-stripping was implemented
// 2. Any edge cases where server-side stripping missed variants
// 
// IMPORTANT: This is render-time insurance only. Server remains authoritative.
// ============================================================

/**
 * Supported reasoning block tag variants (case-insensitive)
 */
const THINK_OPEN_REGEX = /<(think|thinking)\s*>/gi;
const THINK_CLOSE_REGEX = /<\/(think|thinking)\s*>/gi;

/**
 * Strip all reasoning/think blocks from raw AI response text.
 * Handles:
 * - Complete blocks: <think>...</think>, <thinking>...</thinking>
 * - Unclosed/truncated blocks: <think>... (at end of string)
 * - Case variations: <THINK>, <Thinking>, etc.
 * - Nested or multiple blocks
 * 
 * @param raw - Raw AI response potentially containing think blocks
 * @returns Cleaned text with all think blocks removed
 */
export function stripReasoning(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  
  // First pass: Remove complete think blocks (non-greedy, case-insensitive)
  let cleaned = raw.replace(/<(think|thinking)\s*>[\s\S]*?<\/(think|thinking)\s*>/gi, '');
  
  // Second pass: Remove unclosed/truncated think blocks at end of string
  cleaned = cleaned.replace(/<(think|thinking)\s*>[\s\S]*$/i, '');
  
  // Trim whitespace and return
  return cleaned.trim();
}

/**
 * Sanitize coach message content for rendering.
 * Wrapper around stripReasoning that handles edge cases.
 * 
 * @param content - Raw coach message content
 * @returns Sanitized content safe for rendering
 */
export function sanitizeCoachMessage(content: string | null | undefined): string {
  if (!content) return '';
  return stripReasoning(content);
}
