import type { Metadata } from "next";
import { ArrowUp, Sparkles } from "lucide-react";
import { Page, PageHeader, PhaseNote } from "@/components/Page";

export const metadata: Metadata = { title: "AI Stylist" };

const PROMPTS = [
  "Create three outfits for under $200, somewhere between Japanese streetwear and vintage.",
  "What can I wear with black baggy jeans for a gallery opening?",
  "Find a cheaper alternative to this jacket that looks the same.",
  "What should I buy next to get the most new outfits from my wardrobe?",
];

const MODULES = [
  [
    "Fashion Analyst",
    "Turns your request into a structured brief: style, budget, occasion, constraints.",
  ],
  ["Wardrobe Assistant", "Starts from what you already own before suggesting anything new."],
  ["Product Research", "Searches connected marketplaces for the missing pieces."],
  ["Price Comparison", "Compares listings, shipping and condition; flags replicas."],
  ["Outfit Designer", "Composes complete looks and scores colour and style harmony."],
  ["Fit & Size", "Maps your sizes across brands and flags risky fits."],
];

export default function StylistPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="AI Stylist"
        title="Ask for a look."
        actions={<PhaseNote phase="Phase 4">Not live yet</PhaseNote>}
      >
        A stylist that shops for you, explains every pick, and only recommends listings it can
        verify against real marketplace data — prices and availability are never made up.
      </PageHeader>

      <div className="flex flex-col gap-4 rounded-[24px] border border-line bg-surface p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-volt text-volt-ink">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <p className="pt-1.5 text-[15px] leading-relaxed text-ink-soft">
            When I&apos;m ready, you&apos;ll be able to ask things like:
          </p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {PROMPTS.map((p) => (
            <li
              key={p}
              className="rounded-2xl border border-line bg-paper p-4 text-[14px] leading-relaxed text-ink"
            >
              {p}
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center gap-2 rounded-full border border-line-strong bg-paper p-1.5 pl-5 opacity-70">
          <label htmlFor="ask" className="sr-only">
            Message the stylist
          </label>
          <input
            id="ask"
            disabled
            placeholder="The stylist isn't connected yet"
            className="h-10 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted disabled:cursor-not-allowed"
          />
          <button
            disabled
            aria-label="Send"
            className="flex size-10 items-center justify-center rounded-full bg-ink text-paper opacity-40"
          >
            <ArrowUp className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <section aria-labelledby="mod-h" className="mt-14">
        <h2 id="mod-h" className="mb-5 font-display text-[30px] text-ink">
          How it will work
        </h2>
        <ol className="grid gap-3 sm:grid-cols-2">
          {MODULES.map(([title, body], i) => (
            <li key={title} className="flex gap-4 rounded-2xl border border-line p-5">
              <span className="tabular font-mono text-[12px] text-muted">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>
                <span className="block font-medium text-ink">{title}</span>
                <span className="mt-1 block text-[14px] leading-relaxed text-ink-soft">{body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </Page>
  );
}
