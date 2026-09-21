"use client";

/**
 * Custom global-error boundary.
 *
 * Replaces Next.js's boilerplate `_global-error` page, which scored 0.89 on
 * the Lighthouse accessibility audit (no `lang`, no document title, no
 * heading). This page renders when the root layout itself throws, so it must
 * be fully self-contained: inline styles only, no CSS imports, no providers.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <head>
        <title>Something went wrong — Dayflow</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FAF5EC",
          color: "#362D20",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
        }}
      >
        <main
          role="main"
          style={{
            maxWidth: "26rem",
            padding: "2.5rem 1.5rem",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: "0 0 0.75rem",
              fontSize: "0.8125rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#A99D89",
            }}
          >
            Dayflow
          </p>
          <h1
            style={{
              margin: "0 0 0.75rem",
              fontSize: "1.375rem",
              lineHeight: 1.3,
              fontWeight: 600,
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              margin: "0 0 1.75rem",
              fontSize: "0.9375rem",
              lineHeight: 1.6,
              color: "#7A6F5D",
            }}
          >
            An unexpected error interrupted this page. Your data is safe — it
            lives on your device and syncs once you reconnect.
            {error?.digest ? (
              <>
                <br />
                <span style={{ fontSize: "0.8125rem", color: "#A99D89" }}>
                  Reference: {error.digest}
                </span>
              </>
            ) : null}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              appearance: "none",
              border: "1px solid #362D20",
              borderRadius: "0.5rem",
              backgroundColor: "#D9480F",
              borderColor: "#D9480F",
              color: "#ffffff",
              fontSize: "0.9375rem",
              fontWeight: 500,
              padding: "0.5rem 1.25rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
