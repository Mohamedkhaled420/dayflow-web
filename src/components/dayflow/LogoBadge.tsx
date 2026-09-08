"use client";

export function LogoBadge({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-grid place-items-center rounded-full shrink-0 ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, #FFB27A 0%, #F3854B 55%, #E0602F 100%)",
        boxShadow:
          "inset 0 1px 2px rgba(255,255,255,0.55), 0 2px 6px rgba(226, 96, 47, 0.35)",
        border: "1px solid rgba(255, 255, 255, 0.45)",
      }}
      aria-label="Dayflow"
      role="img"
    >
      <svg
        width={size * 0.62}
        height={size * 0.62}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 16.5 C4 9.9 8.6 5 16 5 C23 5 28 9.6 28 15.6 C28 20.4 24.6 23.2 20.6 23.2 L17.2 23.2 C15.9 23.2 15 22.2 15 21 C15 19.9 15.9 19 17 19 L20.2 19 C22.1 19 23.4 17.7 23.4 15.8 C23.4 12.1 20.2 9.2 16 9.2 C11 9.2 8.2 12.6 8.2 16.5 C8.2 20.3 11 23.2 15.6 23.6 L21.5 24.4 C22.7 24.6 23.5 25.6 23.3 26.8 C23.1 27.9 22.1 28.7 21 28.6 L15 27.8 C8.5 27 4 22.4 4 16.5 Z"
          fill="white"
        />
        <circle cx="16" cy="16" r="2.6" fill="#F3854B" />
      </svg>
    </span>
  );
}
