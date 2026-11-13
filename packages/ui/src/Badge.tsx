import type { HTMLAttributes } from "react";
import { FIDELITY_LABELS, type Fidelity } from "@mirra/garment-system";
import { cn } from "./cn";

type Tone = "neutral" | "accent" | "outline" | "warning" | "danger" | "success" | "stage";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-soft",
  accent: "bg-volt text-volt-ink",
  outline: "border border-line-strong text-ink-soft",
  warning: "bg-warning/12 text-warning",
  danger: "bg-danger/12 text-danger",
  success: "bg-success/12 text-success",
  stage: "bg-white/10 text-white/85 backdrop-blur",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em]",
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}

/** Every 3D garment shows how faithful it is to the real product. */
export function FidelityBadge({ fidelity, onStage }: { fidelity: Fidelity; onStage?: boolean }) {
  const { label, description } = FIDELITY_LABELS[fidelity];
  const tone: Tone = onStage
    ? "stage"
    : fidelity === "exact"
      ? "success"
      : fidelity === "approximate"
        ? "warning"
        : "outline";
  return (
    <Badge tone={tone} title={description}>
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          fidelity === "exact"
            ? "bg-success"
            : fidelity === "approximate"
              ? "bg-warning"
              : "bg-current opacity-50",
        )}
      />
      {label}
    </Badge>
  );
}

export type Authenticity =
  "brand_direct" | "authenticated" | "seller_claimed" | "unverified" | "replica_advertised";

const AUTH: Record<Authenticity, { label: string; tone: Tone }> = {
  brand_direct: { label: "Brand / authorized", tone: "success" },
  authenticated: { label: "Authenticated", tone: "success" },
  seller_claimed: { label: "Seller says authentic", tone: "neutral" },
  unverified: { label: "Unverified", tone: "outline" },
  replica_advertised: { label: "Listed as replica", tone: "danger" },
};

export function AuthenticityBadge({ value }: { value: Authenticity }) {
  return <Badge tone={AUTH[value].tone}>{AUTH[value].label}</Badge>;
}
