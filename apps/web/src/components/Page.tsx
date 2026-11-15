import type { ReactNode } from "react";
import { cn } from "@mirra/ui";

export function Page({
  children,
  className,
  wide,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-8 sm:px-8 sm:py-12",
        wide ? "max-w-[1400px]" : "max-w-5xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  children,
  actions,
}: {
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex max-w-2xl flex-col gap-3">
        <h1 className="font-display text-[40px] leading-[1.02] text-ink sm:text-[56px]">{title}</h1>
        {children ? (
          <div className="text-[16px] leading-relaxed text-ink-soft">{children}</div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </header>
  );
}

/** A small, honest label for work that is planned but not built yet. */
export function PhaseNote({ phase, children }: { phase: string; children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 rounded-full border border-line-strong px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
      {phase} · {children}
    </p>
  );
}
