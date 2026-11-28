"use client";
import {
  BODY_PRESETS,
  HAIR_COLORS,
  SKIN_TONES,
  type BodyParams,
  type BodyType,
  type HairStyle,
} from "@mirra/dresser-engine";
import { cn, Segmented } from "@mirra/ui";
import { useView } from "./state";

const SLIDERS: { key: keyof BodyParams; label: string; low: string; high: string }[] = [
  { key: "height", label: "Height", low: "Shorter", high: "Taller" },
  { key: "build", label: "Build", low: "Slim", high: "Full" },
  { key: "shoulders", label: "Shoulders", low: "Narrow", high: "Broad" },
  { key: "hips", label: "Hips", low: "Narrow", high: "Wide" },
  { key: "legLength", label: "Leg length", low: "Shorter", high: "Longer" },
];

function Swatches({
  label,
  colors,
  value,
  onChange,
}: {
  label: string;
  colors: string[];
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            aria-label={`${label} ${c}`}
            aria-pressed={value === c}
            className={cn(
              "size-8 rounded-full ring-offset-2 ring-offset-paper transition-shadow focus-visible:outline-2 focus-visible:outline-volt",
              value === c ? "ring-2 ring-ink" : "ring-1 ring-line-strong",
            )}
            style={{ background: c }}
          />
        ))}
      </div>
    </fieldset>
  );
}

export function AvatarPanel() {
  const { body, appearance, setBody, setBodyPreset, setAppearance } = useView();
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[12px] leading-relaxed text-muted">
        No photos needed: pick a body, then shape it with the sliders. Clothes are refitted to it
        each time.
      </p>
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">Body</span>
        <Segmented<BodyType>
          label="Body"
          value={appearance.bodyType ?? "female"}
          onChange={(bodyType) => setAppearance({ bodyType })}
          options={[
            { value: "female", label: "Female" },
            { value: "male", label: "Male" },
          ]}
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
          Starting point
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {BODY_PRESETS.map((p) => {
            const active = SLIDERS.every(({ key }) => Math.abs(body[key] - p.body[key]) < 0.001);
            return (
              <button
                key={p.id}
                onClick={() => setBodyPreset(p.body)}
                aria-pressed={active}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                  active ? "bg-ink text-paper" : "bg-surface-2 text-ink-soft hover:text-ink",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="flex flex-col gap-4">
        {SLIDERS.map(({ key, label, low, high }) => (
          <label key={key} className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between text-[13px] font-medium text-ink">
              {label}
              <span className="tabular font-mono text-[11px] text-muted">
                {Math.round(body[key] * 100)}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={body[key]}
              onChange={(e) => setBody({ [key]: Number(e.target.value) })}
              aria-valuetext={`${Math.round(body[key] * 100)} (${body[key] < 0.5 ? low : high})`}
            />
            <span className="flex justify-between text-[11px] text-muted">
              <span>{low}</span>
              <span>{high}</span>
            </span>
          </label>
        ))}
      </div>
      <Swatches
        label="Skin tone"
        colors={SKIN_TONES}
        value={appearance.skinTone}
        onChange={(skinTone) => setAppearance({ skinTone })}
      />
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">Hair</span>
        <Segmented<HairStyle>
          label="Hair style"
          value={appearance.hairStyle}
          onChange={(hairStyle) => setAppearance({ hairStyle })}
          options={[
            { value: "none", label: "None" },
            { value: "buzz", label: "Buzz" },
            { value: "short", label: "Short" },
            { value: "bun", label: "Bun" },
            { value: "long", label: "Long" },
          ]}
        />
      </div>
      <Swatches
        label="Hair colour"
        colors={HAIR_COLORS}
        value={appearance.hairColor}
        onChange={(hairColor) => setAppearance({ hairColor })}
      />
      <p className="text-[11px] leading-relaxed text-muted">
        Figures and hair: Universal Base Characters by Quaternius, CC0.
      </p>
    </div>
  );
}
