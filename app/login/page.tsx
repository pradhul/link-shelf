"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, remember }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Login failed");
      }
      const next = searchParams.get("next") || "/";
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-margin-mobile md:p-margin-desktop">
      <main className="w-full max-w-sm">
        <div className="relative z-10 flex flex-col gap-unit-6 overflow-hidden rounded-xl bg-surface-container-lowest p-unit-8 shadow-lg transition-transform duration-500 hover:-translate-y-1">
          <div className="absolute -right-16 -top-16 z-0 h-32 w-32 rounded-full bg-primary-fixed-dim/20 blur-2xl" />
          <div className="absolute -bottom-16 -left-16 z-0 h-32 w-32 rounded-full bg-tertiary-fixed-dim/20 blur-2xl" />

          <div className="relative z-10 flex flex-col gap-unit-2 text-center">
            <div className="mx-auto mb-unit-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-on-primary shadow-md">
              <span className="material-symbols-outlined text-[24px]">
                library_books
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-primary md:text-[32px]">
              Welcome to the Household Shelf
            </h1>
            <p className="text-sm text-on-surface-variant">
              Enter the shared household password to access the library.
            </p>
          </div>

          <form
            onSubmit={onSubmit}
            className="relative z-10 flex flex-col gap-unit-4"
          >
            <div className="group flex flex-col gap-unit-1">
              <label
                htmlFor="password"
                className="text-[12px] font-semibold uppercase tracking-wider text-on-surface-variant transition-colors group-focus-within:text-primary"
              >
                Household Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  required
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg bg-surface-container-low px-unit-4 py-unit-2 text-base text-on-surface transition-all focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  aria-label="Toggle password visibility"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-unit-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-highest hover:text-primary"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {show ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-unit-2">
              <div className="relative flex items-center">
                <input
                  id="remember"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="peer h-5 w-5 cursor-pointer appearance-none rounded-DEFAULT bg-surface-container-low transition-colors checked:bg-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                />
                <span className="material-symbols-outlined pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[16px] text-on-primary opacity-0 transition-opacity peer-checked:opacity-100 fill">
                  check
                </span>
              </div>
              <label
                htmlFor="remember"
                className="cursor-pointer select-none text-sm text-on-surface-variant"
              >
                Remember this device
              </label>
            </div>

            {error && <p className="text-sm text-error">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="group mt-unit-2 flex w-full items-center justify-center gap-unit-2 rounded-lg bg-primary py-unit-2 font-semibold text-on-primary shadow-md transition-all hover:-translate-y-px hover:shadow-lg active:translate-y-px disabled:opacity-70"
            >
              <span>{loading ? "Accessing…" : "Access Shelf"}</span>
              {!loading && (
                <span className="material-symbols-outlined text-[20px] transition-transform group-hover:translate-x-1">
                  arrow_forward
                </span>
              )}
            </button>
          </form>
        </div>
        <div className="mt-unit-8 flex justify-center gap-unit-2 opacity-50">
          <div className="h-1.5 w-1.5 rounded-full bg-on-background" />
          <div className="h-1.5 w-1.5 rounded-full bg-on-background" />
          <div className="h-1.5 w-1.5 rounded-full bg-on-background" />
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
