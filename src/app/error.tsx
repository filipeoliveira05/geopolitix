"use client";

import Link from "next/link";
import { Card } from "@/components/Card";

export default function Error({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-3 p-6 text-center sm:p-10">
      <Card className="flex flex-col items-center gap-3">
        <h1 className="font-display text-xl font-semibold text-ink">Something went wrong</h1>
        <p className="max-w-sm text-sm text-muted">
          This page couldn&apos;t load its data. The source may be temporarily unavailable — try
          again, or head back to the map.
        </p>
        <div className="mt-2 flex gap-3">
          <button
            onClick={() => retry()}
            className="rounded bg-seal px-4 py-1.5 text-sm font-medium text-surface hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded border border-rule px-4 py-1.5 text-sm font-medium text-ink hover:bg-paper"
          >
            Back to map
          </Link>
        </div>
      </Card>
    </div>
  );
}
