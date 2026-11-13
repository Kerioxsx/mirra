"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { isApiError } from "@mirra/api-client";
import { Button, Field } from "@mirra/ui";
import { Wordmark } from "@/components/Wordmark";
import { useAuth } from "@/lib/auth";

type Mode = "login" | "register";

const COPY: Record<
  Mode,
  { title: string; cta: string; switchText: string; switchHref: string; switchCta: string }
> = {
  login: {
    title: "Welcome back.",
    cta: "Sign in",
    switchText: "New to Mirra?",
    switchHref: "/register/",
    switchCta: "Create an account",
  },
  register: {
    title: "Make it yours.",
    cta: "Create account",
    switchText: "Already have an account?",
    switchHref: "/login/",
    switchCta: "Sign in",
  },
};

export function AuthForm({ mode }: { mode: Mode }) {
  const { login, register, status } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const copy = COPY[mode];

  useEffect(() => {
    if (status === "authenticated") router.replace("/dresser/");
  }, [status, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    if (mode === "register" && password.length < 10) {
      setFieldErrors({ password: "Use at least 10 characters." });
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, name);
      router.replace("/dresser/");
    } catch (err) {
      if (isApiError(err, "validation_error") && Array.isArray(err.details)) {
        const next: Record<string, string> = {};
        for (const d of err.details as { loc: string[]; msg: string }[]) {
          const field = String(d.loc[d.loc.length - 1]);
          next[field] = d.msg.replace(/^Value error, /, "");
        }
        setFieldErrors(next);
      } else {
        setError(isApiError(err) ? err.message : "Something went wrong. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-[calc(100dvh-64px)] md:min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-stage lg:block" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_45%,rgba(214,255,61,0.16),transparent_70%)]" />
        <div className="absolute inset-x-12 bottom-12 flex flex-col gap-4 text-white">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">
            Search · Try on · Style
          </p>
          <p className="max-w-md font-display text-[52px] italic leading-[0.98]">
            Try the look before you buy it.
          </p>
        </div>
        <div className="absolute left-1/2 top-[18%] h-[46%] w-[34%] -translate-x-1/2 rounded-[999px_999px_40%_40%] border border-white/10 bg-gradient-to-b from-white/[0.07] to-transparent" />
      </section>
      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-5" noValidate>
          <Wordmark className="mb-4 text-[40px] md:hidden" />
          <h1 className="font-display text-[44px] leading-none text-ink">{copy.title}</h1>
          {error ? (
            <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-[14px] text-danger">
              {error}
            </p>
          ) : null}
          {mode === "register" ? (
            <Field
              label="Name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              error={fieldErrors.display_name}
            />
          ) : null}
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            error={fieldErrors.email}
          />
          <Field
            label="Password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === "register" ? 10 : undefined}
            hint={mode === "register" ? "At least 10 characters." : undefined}
            error={fieldErrors.password}
          />
          <Button type="submit" size="lg" loading={busy} className="mt-2">
            {copy.cta}
          </Button>
          <p className="text-[14px] text-muted">
            {copy.switchText}{" "}
            <Link
              href={copy.switchHref}
              className="font-medium text-ink underline underline-offset-4"
            >
              {copy.switchCta}
            </Link>
          </p>
          <p className="text-[12px] leading-relaxed text-muted">
            The dresser works without an account. Signing in keeps your style profile in sync
            between the website and the desktop app.
          </p>
        </form>
      </section>
    </div>
  );
}
