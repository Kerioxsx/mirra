"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LogIn, Menu, X } from "lucide-react";
import { cn } from "@mirra/ui";
import { useAuth } from "@/lib/auth";
import { isActive, NAV } from "./nav";
import { Wordmark } from "./Wordmark";

const MOBILE_PRIMARY = ["/", "/discover/", "/dresser/", "/stylist/"];

function Initial({ name }: { name: string }) {
  return (
    <span className="flex size-8 items-center justify-center rounded-full bg-ink font-display text-sm italic text-paper">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function Rail() {
  const pathname = usePathname();
  const { status, user } = useAuth();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-line bg-paper px-4 py-6 md:flex">
      <Link href="/" className="mb-10 px-2 text-[34px]" aria-label="Mirra home">
        <Wordmark />
      </Link>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5">
        {NAV.slice(0, -1).map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors",
                active ? "bg-ink text-paper" : "text-ink-soft hover:bg-surface-2 hover:text-ink",
                item.feature && !active && "text-ink",
              )}
            >
              <Icon className="size-[18px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
              {item.label}
              {item.feature ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "ml-auto size-1.5 rounded-full",
                    active ? "bg-volt" : "bg-volt ring-2 ring-volt/30",
                  )}
                />
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="mt-4 border-t border-line pt-4">
        {status === "authenticated" && user ? (
          <Link
            href="/settings/"
            aria-current={isActive(pathname, "/settings/") ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-2 py-2 transition-colors",
              isActive(pathname, "/settings/") ? "bg-surface-2" : "hover:bg-surface-2",
            )}
          >
            <Initial name={user.display_name} />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-ink">
                {user.display_name}
              </span>
              <span className="block truncate text-[12px] text-muted">Profile & settings</span>
            </span>
          </Link>
        ) : (
          <Link
            href="/login/"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-ink-soft hover:bg-surface-2 hover:text-ink"
          >
            <LogIn className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
            {status === "loading" ? "…" : "Sign in"}
          </Link>
        )}
      </div>
    </aside>
  );
}

function MobileBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    sheet.current?.querySelector<HTMLElement>("a")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const primary = NAV.filter((n) => MOBILE_PRIMARY.includes(n.href));
  const more = NAV.filter((n) => !MOBILE_PRIMARY.includes(n.href));
  const moreActive = more.some((n) => isActive(pathname, n.href));
  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] md:hidden"
          onClick={() => setOpen(false)}
        >
          <div
            ref={sheet}
            id="more-menu"
            role="dialog"
            aria-label="More"
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] rounded-3xl border border-line bg-surface p-2 shadow-[var(--mirra-shadow)]"
          >
            {more.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] text-ink hover:bg-surface-2"
                >
                  <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {primary.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                    active ? "text-ink" : "text-muted",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-12 items-center justify-center rounded-full",
                      active && (item.feature ? "bg-volt text-volt-ink" : "bg-surface-2"),
                    )}
                  >
                    <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                  </span>
                  {item.short ?? item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="more-menu"
              className={cn(
                "flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium",
                open || moreActive ? "text-ink" : "text-muted",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-12 items-center justify-center rounded-full",
                  (open || moreActive) && "bg-surface-2",
                )}
              >
                {open ? (
                  <X className="size-5" aria-hidden="true" />
                ) : (
                  <Menu className="size-5" aria-hidden="true" />
                )}
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-paper focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <Rail />
      <main
        id="main"
        className="min-w-0 flex-1 pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0"
      >
        {children}
      </main>
      <MobileBar />
    </div>
  );
}
