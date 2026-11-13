import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonClasses } from "@mirra/ui";
import { Page } from "@/components/Page";
import { MarketplaceGrid } from "@/features/discover/MarketplaceGrid";
import { HeroStage } from "@/features/home/HeroStage";

const PILLARS = [
  {
    href: "/dresser/",
    kicker: "01 · Try on",
    title: "The 3D dresser",
    body: "Layer, swap and recolour every piece on an avatar shaped like you. Undo anything.",
    status: "Playable now",
  },
  {
    href: "/discover/",
    kicker: "02 · Find",
    title: "Every store, one search",
    body: "Text, photo or whole-outfit search across marketplaces, with prices and shipping side by side.",
    status: "Next up",
  },
  {
    href: "/stylist/",
    kicker: "03 · Style",
    title: "An AI stylist that shops",
    body: "Ask for three looks under $200. It starts from what you own and explains every pick.",
    status: "Planned",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div className="mx-auto grid max-w-[1400px] items-center gap-10 px-4 py-10 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:py-16">
          <div className="flex flex-col gap-7">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              AI fashion dresser
            </p>
            <h1 className="font-display text-[52px] leading-[0.95] text-ink sm:text-[76px] xl:text-[92px]">
              Search every store.
              <br />
              <em className="text-ink-soft">Try it on.</em>
              <br />
              Wear it out.
            </h1>
            <p className="max-w-lg text-[17px] leading-relaxed text-ink-soft">
              Mirra puts a dressing room, a shopping engine and a personal stylist in one place — so
              finding the piece, seeing it on you and building the outfit happen together.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/dresser/" className={buttonClasses("primary", "lg")}>
                Open the dresser
              </Link>
              <Link href="/discover/" className={buttonClasses("secondary", "lg")}>
                Discover
              </Link>
            </div>
          </div>
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[28px] bg-stage shadow-[var(--mirra-shadow)] sm:aspect-[5/5] lg:aspect-[4/5]">
            <HeroStage />
            <Link
              href="/dresser/"
              className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-2 text-[13px] font-medium text-black backdrop-blur hover:bg-white"
            >
              Dress this look <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <Page wide>
        <section
          aria-label="What Mirra does"
          className="grid gap-px overflow-hidden rounded-[var(--mirra-radius)] border border-line bg-line md:grid-cols-3"
        >
          {PILLARS.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="group flex flex-col gap-4 bg-paper p-6 transition-colors hover:bg-surface sm:p-8"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                {p.kicker}
              </p>
              <h2 className="font-display text-[30px] leading-tight text-ink">{p.title}</h2>
              <p className="text-[15px] leading-relaxed text-ink-soft">{p.body}</p>
              <span className="mt-auto flex items-center justify-between pt-4 text-[13px] font-medium text-ink">
                {p.status}
                <ArrowUpRight
                  className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </Link>
          ))}
        </section>

        <section aria-labelledby="mk-h" className="mt-16 flex flex-col gap-6">
          <div className="flex max-w-2xl flex-col gap-2">
            <h2 id="mk-h" className="font-display text-[36px] leading-tight text-ink">
              Where Mirra shops
            </h2>
            <p className="text-[15px] leading-relaxed text-ink-soft">
              Only through official APIs, affiliate feeds and partnerships — never scraping. This
              list comes straight from the API, so it always shows what&apos;s actually connected.
            </p>
          </div>
          <MarketplaceGrid />
        </section>
      </Page>
    </>
  );
}
