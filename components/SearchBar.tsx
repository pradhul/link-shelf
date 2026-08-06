"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramQ = searchParams.get("q") ?? "";
  const [q, setQ] = useState(paramQ);
  const [pending, startTransition] = useTransition();

  // Keep input in sync when navigating via browser back/forward or links
  useEffect(() => {
    setQ(paramQ);
  }, [paramQ]);

  // Search as you type (debounced)
  useEffect(() => {
    const trimmed = q.trim();
    const current = paramQ.trim();
    if (trimmed === current) return;

    const id = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      const next = params.toString();
      startTransition(() => {
        router.replace(next ? `?${next}` : "?");
      });
    }, 280);

    return () => window.clearTimeout(id);
  }, [q, paramQ, router, searchParams]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    const params = new URLSearchParams(searchParams.toString());
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    const next = params.toString();
    startTransition(() => {
      router.replace(next ? `?${next}` : "?");
    });
  }

  return (
    <form onSubmit={submit} className="relative w-full max-w-xl">
      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant">
        search
      </span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search your shelf…"
        className="w-full rounded-full bg-surface-container-low py-2.5 pl-10 pr-4 text-sm text-on-surface outline-none ring-primary placeholder:text-outline focus:bg-surface-container-lowest focus:ring-2"
      />
      {pending && (
        <span
          className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-outline/40 border-t-on-surface-variant"
          aria-hidden
        />
      )}
    </form>
  );
}
