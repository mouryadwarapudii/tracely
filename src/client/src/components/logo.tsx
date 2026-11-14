/** The mark is a three-span waterfall: a trace, drawn small. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M7 11h18M11 16h10M15 21h6" stroke="var(--accent-ink)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
