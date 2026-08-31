import Link from "next/link";
import { Card } from "@/components/Card";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-3 p-6 text-center sm:p-10">
      <Card className="flex flex-col items-center gap-3">
        <h1 className="font-display text-xl font-semibold text-ink">Not found</h1>
        <p className="max-w-sm text-sm text-muted">
          Nothing here. The page or record you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/"
          className="mt-2 rounded bg-seal px-4 py-1.5 text-sm font-medium text-surface hover:opacity-90"
        >
          Back to map
        </Link>
      </Card>
    </div>
  );
}
