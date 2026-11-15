"use client";
import { useEffect, useMemo, useState } from "react";
import { Ruler } from "lucide-react";
import type { Measurements, SizeAdvice, SizeGuide, SizeReading } from "@mirra/shared-types";
import { Field } from "@mirra/ui";
import { getClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const STORE = "mirra.measurements";
type Key = keyof Measurements;

/** Profile keys (Settings, style profile `sizes`) for each measurement. */
export const MEASUREMENT_KEYS: readonly [Key, string, string][] = [
  ["height_cm", "Height", "cm"],
  ["chest_cm", "Chest", "cm"],
  ["waist_cm", "Waist", "cm"],
  ["foot_mm", "Foot length", "mm"],
];

function fieldsFor(kind: SizeGuide["kind"]): Key[] {
  if (kind === "shoe") return ["foot_mm"];
  if (kind === "bottom") return ["height_cm", "waist_cm"];
  return ["height_cm", "chest_cm"];
}

function readLocal(): Measurements {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}") as Measurements;
  } catch {
    return {};
  }
}

const range = (r: SizeReading["height_cm"], unit: string) =>
  r ? `${Math.round(r.min)}–${Math.round(r.max)} ${unit}` : null;

function fits(r: SizeReading): string {
  return (
    [
      range(r.height_cm, "cm tall"),
      r.chest_cm ? `chest ${range(r.chest_cm, "cm")}` : null,
      r.waist_cm ? `waist ${range(r.waist_cm, "cm")}` : null,
      r.foot_mm ? `foot ${range(r.foot_mm, "mm")}` : null,
    ]
      .filter(Boolean)
      .join(", ") || "Check the shop's chart"
  );
}

/** Reads a Chinese-market listing's sizes and suggests one from the shopper's measurements. */
export function SizeGuidePanel({ guide }: { guide: SizeGuide }) {
  const { status } = useAuth();
  const [m, setM] = useState<Measurements>({});
  const [advice, setAdvice] = useState<SizeAdvice | null>(null);
  const keys = fieldsFor(guide.kind);

  // the profile's measurements when signed in, else what this device remembers
  useEffect(() => {
    const local = readLocal();
    if (status !== "authenticated") {
      setM(local);
      return;
    }
    const c = getClient();
    c.unwrap(c.api.GET("/api/v1/users/me/preferences"))
      .then((p) => {
        const fromProfile: Measurements = {};
        for (const [k] of MEASUREMENT_KEYS) {
          const v = Number((p.sizes ?? {})[k]);
          if (Number.isFinite(v) && v > 0) fromProfile[k] = v;
        }
        setM({ ...local, ...fromProfile });
      })
      .catch(() => setM(local));
  }, [status]);

  const filled = useMemo(() => keys.filter((k) => m[k] != null), [keys, m]);
  const labelKey = guide.labels.join("|");

  useEffect(() => {
    if (!filled.length) {
      setAdvice(null);
      return;
    }
    const t = setTimeout(() => {
      const c = getClient();
      c.unwrap(
        c.api.POST("/api/v1/sizes/advice", {
          body: { labels: guide.labels, kind: guide.kind, cut: guide.cut, measurements: m },
        }),
      )
        .then(setAdvice)
        .catch(() => setAdvice(null));
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelKey, guide.kind, guide.cut, m, filled.length]);

  function update(k: Key, raw: string) {
    const v = raw.trim() === "" ? undefined : Number(raw);
    const next = { ...m };
    if (v === undefined || !Number.isFinite(v)) delete next[k];
    else next[k] = v;
    setM(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      /* private mode: keep it for this page only */
    }
  }

  return (
    <section aria-labelledby="size-h" className="flex flex-col gap-3 border-t border-line pt-5">
      <h2
        id="size-h"
        className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted"
      >
        <Ruler className="size-3.5" aria-hidden="true" />
        Chinese sizes
      </h2>
      <table className="w-full text-[13.5px]">
        <caption className="sr-only">What each size on this listing is cut for</caption>
        <thead>
          <tr className="text-left text-[12px] text-muted">
            <th scope="col" className="py-1 font-medium">
              Size
            </th>
            <th scope="col" className="py-1 font-medium">
              Cut for
            </th>
          </tr>
        </thead>
        <tbody>
          {guide.readings.map((r) => (
            <tr
              key={r.label}
              className={
                advice?.suggested === r.label
                  ? "bg-volt/20 font-medium text-ink"
                  : "border-t border-line text-ink-soft"
              }
            >
              <th scope="row" className="tabular py-1.5 pr-3 text-left font-medium text-ink">
                {r.label}
              </th>
              <td className="tabular py-1.5" title={r.note}>
                {fits(r)}
                {r.basis === "standard" ? (
                  <span className="ml-1.5 text-[11px] text-muted">national code</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid grid-cols-2 gap-3">
        {MEASUREMENT_KEYS.filter(([k]) => keys.includes(k)).map(([k, label, unit]) => (
          <Field
            key={k}
            label={`Your ${label.toLowerCase()} (${unit})`}
            inputMode="decimal"
            value={m[k] ?? ""}
            onChange={(e) => update(k, e.target.value)}
          />
        ))}
      </div>
      <p aria-live="polite" className="text-[13.5px] text-ink">
        {advice?.suggested ? (
          <>
            <strong className="font-medium">Try {advice.suggested}.</strong> {advice.reason}
          </>
        ) : filled.length ? (
          (advice?.reason ?? "")
        ) : (
          "Enter your measurements to get a size suggestion."
        )}
      </p>
      <p className="text-[12px] text-muted">{guide.disclaimer}</p>
    </section>
  );
}
