"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { buttonClasses, EmptyState, Spinner } from "@mirra/ui";
import { useAuth } from "@/lib/auth";

/** Shows children only when signed in; otherwise an inline sign-in prompt (no redirects). */
export function RequireAuth({ children, reason }: { children: ReactNode; reason: string }) {
  const { status } = useAuth();
  if (status === "loading") {
    return (
      <div className="flex items-center gap-3 py-16 text-muted" role="status">
        <Spinner className="size-5" /> Checking your session…
      </div>
    );
  }
  if (status === "guest") {
    return (
      <EmptyState
        icon={<Lock className="size-5" aria-hidden="true" />}
        eyebrow="Account needed"
        title="Sign in to continue"
      >
        <p>{reason}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/login/" className={buttonClasses()}>
            Sign in
          </Link>
          <Link href="/register/" className={buttonClasses("secondary")}>
            Create an account
          </Link>
        </div>
      </EmptyState>
    );
  }
  return <>{children}</>;
}
