import Link from "next/link";
import { buttonClasses } from "@mirra/ui";
import { Page } from "@/components/Page";

export default function NotFound() {
  return (
    <Page>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">404</p>
      <h1 className="mt-3 font-display text-[56px] leading-none text-ink">
        Not in this collection.
      </h1>
      <Link href="/" className={buttonClasses("primary", "md", "mt-8")}>
        Back home
      </Link>
    </Page>
  );
}
