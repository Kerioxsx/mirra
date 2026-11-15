import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./cn";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "accent" | "danger" | "quietDanger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-ink-soft",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-2",
  ghost: "text-ink hover:bg-surface-2",
  accent: "bg-volt text-volt-ink hover:brightness-95",
  danger: "bg-danger text-white hover:brightness-110",
  quietDanger: "text-danger hover:bg-danger/10",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2.5",
};

/** Button styling for non-button elements (e.g. a Next.js <Link> that looks like a button). */
export function buttonClasses(
  variant: Variant = "primary",
  size: Size = "md",
  className?: string,
): string {
  return cn(
    "inline-flex select-none items-center justify-center rounded-full font-medium tracking-[-0.01em]",
    "transition-[background,filter,transform] duration-150 active:scale-[0.98]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt",
    "disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className)}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  tone?: "default" | "stage";
}

/** Square icon button. `label` is required for screen readers and the tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active, tone = "default", className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt",
        "disabled:pointer-events-none disabled:opacity-40",
        tone === "stage"
          ? active
            ? "bg-volt text-volt-ink"
            : "bg-white/8 text-white/80 hover:bg-white/15 hover:text-white"
          : active
            ? "bg-ink text-paper"
            : "text-ink-soft hover:bg-surface-2 hover:text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
