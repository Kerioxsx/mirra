"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { isApiError } from "@mirra/api-client";
import type { Preferences } from "@mirra/shared-types";
import { Button, Field, Segmented, Spinner } from "@mirra/ui";
import { getClient } from "@/lib/api";
import { MEASUREMENT_KEYS } from "@/features/discover/SizeGuide";
import { useAuth } from "@/lib/auth";
import { applyTheme, readTheme, type ThemePref } from "@/lib/theme";
import { TagInput } from "./TagInput";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-6 border-t border-line py-10 md:grid-cols-[260px_1fr]">
      <div>
        <h2 className="font-display text-[26px] leading-tight text-ink">{title}</h2>
        {description ? (
          <p className="mt-2 text-[14px] leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      <div className="flex max-w-xl flex-col gap-5">{children}</div>
    </section>
  );
}

function Saved({ state }: { state: "idle" | "saved" | string }) {
  if (state === "idle") return null;
  return (
    <p
      role="status"
      className={state === "saved" ? "text-[13px] text-success" : "text-[13px] text-danger"}
    >
      {state === "saved" ? "Saved." : state}
    </p>
  );
}

function ProfileSection() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.display_name ?? "");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState("idle");
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setState("idle");
    try {
      const c = getClient();
      setUser(await c.unwrap(c.api.PATCH("/api/v1/users/me", { body: { display_name: name } })));
      setState("saved");
    } catch (err) {
      setState(isApiError(err) ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section title="Profile">
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field label="Email" value={user?.email ?? ""} readOnly disabled />
        <Field
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
        />
        <div className="flex items-center gap-4">
          <Button type="submit" loading={busy}>
            Save profile
          </Button>
          <Saved state={state} />
        </div>
      </form>
    </Section>
  );
}

const SIZE_KEYS = [
  ["top", "Top", "e.g. M"],
  ["bottom", "Bottom", "e.g. 32x32"],
  ["shoe", "Shoe", "e.g. US 10"],
] as const;

function StyleSection() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState("idle");
  useEffect(() => {
    const c = getClient();
    c.unwrap(c.api.GET("/api/v1/users/me/preferences"))
      .then(setPrefs)
      .catch(() => setLoadError(true));
  }, []);
  if (loadError)
    return (
      <Section title="Style profile">
        <p role="alert" className="text-danger">
          Couldn&apos;t load your preferences.
        </p>
      </Section>
    );
  if (!prefs) {
    return (
      <Section title="Style profile">
        <p role="status" className="flex items-center gap-2 text-muted">
          <Spinner className="size-4" /> Loading…
        </p>
      </Section>
    );
  }
  const set = <K extends keyof Preferences>(k: K, v: Preferences[K]) =>
    setPrefs({ ...prefs, [k]: v });
  const money = (v: Preferences["budget_min"]) => (v === null || v === undefined ? "" : String(v));
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setState("idle");
    try {
      const c = getClient();
      setPrefs(await c.unwrap(c.api.PUT("/api/v1/users/me/preferences", { body: prefs! })));
      setState("saved");
    } catch (err) {
      setState(
        isApiError(err)
          ? err.code === "validation_error"
            ? "Check the highlighted values."
            : err.message
          : "Couldn't save.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section
      title="Style profile"
      description="Used to rank search results, guide the stylist and pre-select sizes. Only you can see it."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <TagInput
          label="Aesthetics"
          hint="Press Enter to add. e.g. Japanese streetwear, vintage, techwear"
          value={prefs.styles ?? []}
          onChange={(v) => set("styles", v)}
        />
        <TagInput
          label="Favourite brands"
          value={prefs.favorite_brands ?? []}
          onChange={(v) => set("favorite_brands", v)}
          max={50}
        />
        <TagInput
          label="Brands to avoid"
          value={prefs.avoided_brands ?? []}
          onChange={(v) => set("avoided_brands", v)}
          max={50}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {SIZE_KEYS.map(([k, label, ph]) => (
            <Field
              key={k}
              label={`${label} size`}
              placeholder={ph}
              maxLength={20}
              value={(prefs.sizes ?? {})[k] ?? ""}
              onChange={(e) => {
                const sizes = { ...(prefs.sizes ?? {}) };
                if (e.target.value.trim()) sizes[k] = e.target.value;
                else delete sizes[k];
                set("sizes", sizes);
              }}
            />
          ))}
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="text-[13px] font-medium text-ink-soft">Your measurements</legend>
          <p className="text-[13px] text-muted">
            Measure your body, not a garment. Mirra uses these to suggest Chinese sizes on Taobao,
            Tmall and Weidian listings.
          </p>
          <div className="grid gap-4 sm:grid-cols-4">
            {MEASUREMENT_KEYS.map(([k, label, unit]) => (
              <Field
                key={k}
                label={`${label} (${unit})`}
                inputMode="decimal"
                maxLength={5}
                value={(prefs.sizes ?? {})[k] ?? ""}
                onChange={(e) => {
                  const sizes = { ...(prefs.sizes ?? {}) };
                  const v = e.target.value.replace(/[^0-9.]/g, "");
                  if (v) sizes[k] = v;
                  else delete sizes[k];
                  set("sizes", sizes);
                }}
              />
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Budget from"
            inputMode="decimal"
            value={money(prefs.budget_min)}
            onChange={(e) => set("budget_min", e.target.value || null)}
          />
          <Field
            label="Budget to"
            inputMode="decimal"
            value={money(prefs.budget_max)}
            onChange={(e) => set("budget_max", e.target.value || null)}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="currency" className="text-[13px] font-medium text-ink-soft">
              Currency
            </label>
            <select
              id="currency"
              value={prefs.currency ?? "USD"}
              onChange={(e) => set("currency", e.target.value)}
              className="h-11 rounded-xl border border-line-strong bg-surface px-3 text-[15px] text-ink"
            >
              {["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CNY", "KRW"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <Field
          label="Ship to (country code)"
          hint="Two letters, e.g. US, GB, DE, JP. Used for shipping costs."
          maxLength={2}
          value={prefs.ship_to_country ?? ""}
          onChange={(e) => set("ship_to_country", e.target.value.toUpperCase() || null)}
        />
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-ink-soft">3D render quality</span>
          <Segmented
            label="3D render quality"
            value={prefs.render_quality ?? "medium"}
            onChange={(v) => set("render_quality", v)}
            options={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
            ]}
          />
        </div>
        <div className="flex items-center gap-4">
          <Button type="submit" loading={busy}>
            Save style profile
          </Button>
          <Saved state={state} />
        </div>
      </form>
    </Section>
  );
}

function AppearanceSection() {
  const [theme, setTheme] = useState<ThemePref>("system");
  useEffect(() => setTheme(readTheme()), []);
  return (
    <Section title="Appearance" description="The 3D stage always uses the dark studio.">
      <Segmented<ThemePref>
        label="Theme"
        value={theme}
        onChange={(t) => {
          setTheme(t);
          applyTheme(t);
        }}
        options={[
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
      />
    </Section>
  );
}

function AccountSection() {
  const { logout } = useAuth();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onDelete(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const c = getClient();
      await c.unwrap(c.api.DELETE("/api/v1/users/me", { body: { password } }));
      await logout();
      router.replace("/");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't delete the account.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section
      title="Account"
      description="Deleting your account permanently removes your profile, preferences and everything you've saved."
    >
      <div>
        <Button
          variant="secondary"
          onClick={async () => {
            await logout();
            router.replace("/");
          }}
        >
          Sign out
        </Button>
      </div>
      {!confirming ? (
        <div>
          <Button variant="ghost" className="text-danger" onClick={() => setConfirming(true)}>
            Delete account…
          </Button>
        </div>
      ) : (
        <form
          onSubmit={onDelete}
          className="flex flex-col gap-4 rounded-2xl border border-danger/40 p-5"
        >
          <p className="text-[14px] text-ink">
            This can&apos;t be undone. Enter your password to confirm.
          </p>
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
            required
          />
          <div className="flex gap-2">
            <Button type="submit" variant="danger" loading={busy} disabled={!password}>
              Delete permanently
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Section>
  );
}

export function SettingsView() {
  return (
    <>
      <ProfileSection />
      <StyleSection />
      <AppearanceSection />
      <AccountSection />
    </>
  );
}
