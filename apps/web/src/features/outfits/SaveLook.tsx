"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useStore } from "zustand";
import { Check } from "lucide-react";
import { isApiError } from "@mirra/api-client";
import { Button } from "@mirra/ui";
import { outfitStore } from "@/features/dresser/state";
import { getClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toOutfitIn } from "./convert";

/** Save the current dresser look to the shopper's account (syncs across web and desktop). */
export function SaveLook() {
  const { status } = useAuth();
  const outfit = useStore(outfitStore, (s) => s.history.present);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const empty = Object.keys(outfit.items).length === 0;

  if (status !== "authenticated") {
    return (
      <p className="rounded-2xl border border-line p-4 text-[13px] text-ink-soft">
        <Link href="/login/" className="font-medium text-ink underline underline-offset-4">
          Sign in
        </Link>{" "}
        to save looks to your account. Your current look stays on this device either way.
      </p>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { body, skipped } = toOutfitIn(outfit, name.trim() || "Untitled look");
    if (!body.items.length) return;
    setBusy(true);
    setMessage(null);
    const c = getClient();
    try {
      await c.unwrap(c.api.POST("/api/v1/outfits", { body }));
      setName("");
      setMessage({
        ok: true,
        text: skipped.length
          ? `Saved. Left out ${skipped.join(", ")} — try it on again from Discover to include it.`
          : "Saved to your account.",
      });
    } catch (err) {
      setMessage({ ok: false, text: isApiError(err) ? err.message : "Couldn't save this look." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-2 rounded-2xl border border-line p-4"
      aria-label="Save look"
    >
      <label
        htmlFor="look-name"
        className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted"
      >
        Save this look
      </label>
      <div className="flex gap-2">
        <input
          id="look-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          placeholder="Name it (optional)"
          className="h-9 min-w-0 flex-1 rounded-full border border-line-strong bg-surface px-3 text-[13px] text-ink outline-none focus:border-ink"
        />
        <Button type="submit" size="sm" loading={busy} disabled={empty}>
          Save
        </Button>
      </div>
      {message ? (
        <p
          role="status"
          className={
            message.ok
              ? "flex items-start gap-1.5 text-[12.5px] text-success"
              : "text-[12.5px] text-danger"
          }
        >
          {message.ok ? <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> : null}
          <span>
            {message.text}{" "}
            {message.ok ? (
              <Link href="/outfits/" className="font-medium underline underline-offset-4">
                See saved outfits
              </Link>
            ) : null}
          </span>
        </p>
      ) : null}
    </form>
  );
}
