const CLOSED_THINK = /<\s*think\s*>[\s\S]*?<\s*\/\s*think\s*>/gi;
const OPEN_THINK = /<\s*think\s*>/i;

/** Remove chain-of-thought blocks, including truncated unclosed blocks. */
export function stripReasoning(raw: string): string {
  let out = raw.replace(CLOSED_THINK, "");
  const open = out.search(OPEN_THINK);
  if (open !== -1) out = out.slice(0, open);
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
