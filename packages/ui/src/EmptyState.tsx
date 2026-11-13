import type { ReactNode } from "react";
import { cn } from "./cn";

export interface EmptyStateProps {
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, eyebrow, title, children, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-4 rounded-[var(--mirra-radius)] border border-dashed border-line-strong p-8 sm:p-10",
        className,
      )}
    >
      {icon ? (
        <div className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-ink">
          {icon}
        </div>
      ) : null}
      <div className="flex max-w-prose flex-col gap-2">
        {eyebrow ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">{eyebrow}</p>
        ) : null}
        <h2 className="font-display text-2xl leading-tight text-ink">{title}</h2>
        {children ? (
          <div className="text-[15px] leading-relaxed text-ink-soft">{children}</div>
        ) : null}
      </div>
      {action}
    </div>
  );
}
