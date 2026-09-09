import * as React from "react";

/**
 * SSR-safe media query hook. Returns `fallback` until mounted
 * (avoids hydration mismatches), then tracks the query live.
 */
export function useMediaQuery(query: string, fallback = false) {
  const [matches, setMatches] = React.useState<boolean>(fallback);

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Phone layout — bottom-sheet territory (below `sm`). */
export const useIsPhone = () => useMediaQuery("(max-width: 639px)");
