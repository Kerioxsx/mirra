import { cn } from "@mirra/ui";

/** The Mirra wordmark: an italic serif with a reflected "a" accent dot. */
export function Wordmark({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("font-display italic leading-none tracking-[-0.04em] text-ink", className)}>
      {compact ? "M" : "Mirra"}
      <span
        aria-hidden="true"
        className="ml-0.5 inline-block size-[0.18em] translate-y-[-0.05em] rounded-full bg-volt align-baseline"
      />
    </span>
  );
}
