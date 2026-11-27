import { cn } from "./cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  tone = "default",
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (v: T) => void;
  label: string;
  tone?: "default" | "stage";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex w-fit max-w-full rounded-full p-0.5",
        tone === "stage" ? "bg-white/8" : "bg-surface-2",
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-volt",
              tone === "stage"
                ? active
                  ? "bg-white text-black"
                  : "text-white/70 hover:text-white"
                : active
                  ? "bg-surface text-ink shadow-sm"
                  : "text-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
