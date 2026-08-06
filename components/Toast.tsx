"use client";

import { useEffect } from "react";

type Props = {
  message: string | null;
  onDismiss: () => void;
  durationMs?: number;
};

export function Toast({ message, onDismiss, durationMs = 3200 }: Props) {
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(id);
  }, [message, onDismiss, durationMs]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="toast-enter fixed bottom-6 left-1/2 z-[60] max-w-[min(90vw,24rem)] -translate-x-1/2 rounded-full bg-primary px-4 py-2.5 text-center text-sm font-medium text-on-primary shadow-lg"
    >
      {message}
    </div>
  );
}
