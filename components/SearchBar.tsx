"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

export function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (q.trim()) params.set("q", q.trim());
    else params.delete("q");
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  return (
    <form onSubmit={submit} className="relative w-full max-w-xl">
      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
        search
      </span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search your shelf…"
        className="w-full rounded-full bg-surface-container-low py-2.5 pl-10 pr-4 text-sm text-on-surface outline-none ring-primary placeholder:text-outline focus:bg-surface-container-lowest focus:ring-2"
      />
      {pending && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-outline">
          …
        </span>
      )}
    </form>
  );
}
