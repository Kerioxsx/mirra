"use client";
import { useId, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

/** Free-form tags: Enter or comma adds, Backspace on empty removes the last. */
export function TagInput({
  label,
  hint,
  value,
  onChange,
  max = 20,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string[];
  onChange: (v: string[]) => void;
  max?: number;
  placeholder?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const t = raw.trim().slice(0, 40);
    if (!t || value.some((v) => v.toLowerCase() === t.toLowerCase()) || value.length >= max) return;
    onChange([...value, t]);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
      setDraft("");
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink-soft">
        {label}
      </label>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-2 py-1.5 focus-within:border-ink focus-within:ring-4 focus-within:ring-volt/40">
        {value.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-[13px] text-ink"
          >
            {t}
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v !== t))}
              aria-label={`Remove ${t}`}
              className="rounded-full p-0.5 text-muted hover:bg-line hover:text-ink"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => {
            add(draft);
            setDraft("");
          }}
          placeholder={value.length ? "" : placeholder}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="h-8 min-w-[8rem] flex-1 bg-transparent px-1.5 text-[15px] text-ink outline-none placeholder:text-muted"
        />
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="text-[12px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
