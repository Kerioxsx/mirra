"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, X } from "lucide-react";
import { isApiError } from "@mirra/api-client";
import { taxonomy, type Category, type components } from "@mirra/shared-types";
import { Button } from "@mirra/ui";
import { getClient } from "@/lib/api";

export type PhotoSearchResponse = components["schemas"]["PhotoSearchResponse"];

const MAX_BYTES = 5 * 1024 * 1024;

/** Simple colour names (the same words the server's photo reader uses) and a typical RGB each. */
const PALETTE: [string, number, number, number][] = [
  ["black", 22, 22, 24],
  ["white", 242, 242, 238],
  ["grey", 128, 128, 128],
  ["navy", 28, 36, 72],
  ["blue", 52, 92, 168],
  ["light blue", 146, 182, 220],
  ["green", 42, 118, 62],
  ["olive", 108, 110, 52],
  ["beige", 214, 194, 160],
  ["cream", 240, 230, 206],
  ["brown", 110, 72, 42],
  ["red", 188, 36, 38],
  ["burgundy", 108, 26, 40],
  ["pink", 230, 152, 180],
  ["purple", 110, 62, 140],
  ["yellow", 230, 200, 54],
  ["orange", 230, 122, 42],
];

function nearest(r: number, g: number, b: number): string {
  let best = PALETTE[0]![0];
  let bestD = Infinity;
  for (const [name, pr, pg, pb] of PALETTE) {
    // weighted RGB distance: close enough to how eyes rank colours for this purpose
    const d = 2 * (r - pr) ** 2 + 4 * (g - pg) ** 2 + 3 * (b - pb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

/**
 * The main colours of a photo, worked out on this device: the middle of the picture (where the
 * garment usually is) sampled at 48x48 and binned to simple colour names.
 */
async function dominantColours(url: string): Promise<string[]> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  // the centre 70% of the frame
  const sw = img.naturalWidth * 0.7;
  const sh = img.naturalHeight * 0.7;
  ctx.drawImage(img, img.naturalWidth * 0.15, img.naturalHeight * 0.15, sw, sh, 0, 0, size, size);
  const px = ctx.getImageData(0, 0, size, size).data;
  const counts = new Map<string, number>();
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3]! < 128) continue;
    const name = nearest(px[i]!, px[i + 1]!, px[i + 2]!);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const total = size * size;
  return [...counts.entries()]
    .filter(([, n]) => n / total >= 0.12)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name);
}

/** Search with a photo: Claude reads it when the server can, else colours and a picked type. */
export function PhotoSearch({
  onResults,
  onClose,
  result,
}: {
  onResults: (r: PhotoSearchResponse) => void;
  onClose: () => void;
  result: PhotoSearchResponse | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [colours, setColours] = useState<string[]>([]);
  const [category, setCategory] = useState<Category | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function choose(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) {
      setError("Use a JPEG, PNG, WebP or GIF photo.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("Photos can be up to 5 MB.");
      return;
    }
    const url = URL.createObjectURL(f);
    setFile(f);
    setPreview(url);
    try {
      setColours(await dominantColours(url));
    } catch {
      setColours([]);
    }
  }

  async function search(garment = 0) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const label = taxonomy.categories.find((c) => c.id === category)?.label;
    const hint = [colours[0], label?.replace(/s$/, "").toLowerCase()].filter(Boolean).join(" ");
    const form = new FormData();
    form.append("image", file);
    form.append("garment", String(garment));
    if (category) form.append("category", category);
    if (hint && category) form.append("hint", hint);
    const c = getClient();
    try {
      onResults(
        await c.unwrap(
          c.api.POST("/api/v1/search/photo", {
            body: form as unknown as components["schemas"]["Body_search_photo_search"],
          }),
        ),
      );
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't search with that photo.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void search();
  }

  const photo = result?.photo;
  const garments = photo?.garments ?? [];
  return (
    <section
      aria-labelledby="photo-h"
      className="flex flex-col gap-4 rounded-[var(--mirra-radius)] border border-line bg-surface p-5"
    >
      <div className="flex items-center justify-between">
        <h2 id="photo-h" className="flex items-center gap-2 text-[15px] font-medium text-ink">
          <Camera className="size-4" aria-hidden="true" /> Search with a photo
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close photo search"
          className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <label
          className="relative flex aspect-[4/5] w-full shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-line-strong bg-surface-2 text-center text-[13px] text-ink-soft hover:border-ink sm:w-44"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void choose(e.dataTransfer.files[0]);
          }}
        >
          {preview ? (
            <img
              src={preview}
              alt="Your photo"
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <span className="px-4">Choose or drop a photo of the piece</span>
          )}
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            capture="environment"
            className="sr-only"
            aria-label="Photo"
            onChange={(e) => void choose(e.target.files?.[0])}
          />
        </label>
        <div className="flex flex-1 flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
            What is it?
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category | "")}
              className="h-11 rounded-xl border border-line-strong bg-surface px-3 text-[15px] text-ink"
            >
              <option value="">Let Mirra work it out</option>
              {taxonomy.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          {colours.length ? (
            <p className="text-[13px] text-ink-soft">
              Main colours: <span className="text-ink">{colours.join(", ")}</span>
            </p>
          ) : null}
          <Button type="submit" disabled={!file || busy} className="self-start">
            {busy ? "Searching…" : "Search with this photo"}
          </Button>
          {error ? (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          ) : null}
          {photo && garments.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2" aria-label="Pieces in your photo">
              <span className="text-[12px] text-muted">Also in your photo:</span>
              {garments.map((g, i) =>
                i === photo.garment_index ? null : (
                  <button
                    key={`${g.query}-${i}`}
                    type="button"
                    disabled={busy}
                    onClick={() => void search(i)}
                    className="rounded-full bg-surface-2 px-3 py-1.5 text-[12.5px] text-ink-soft hover:text-ink"
                  >
                    {g.query}
                  </button>
                ),
              )}
            </div>
          ) : null}
          <p className="text-[12px] text-muted">
            Your photo is sent only when you search, and Mirra doesn&apos;t keep it.
          </p>
        </div>
      </form>
    </section>
  );
}
