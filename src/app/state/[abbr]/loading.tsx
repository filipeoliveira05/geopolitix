import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-6 sm:p-10">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-2 h-9 w-56" />

      <div className="mt-6">
        <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
          {["current", "history", "geography", "midterms"].map((k) => (
            <Skeleton key={k} className="mb-2 h-8 w-28 shrink-0" />
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-6">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Skeleton className="h-3 w-32" />
              <Skeleton className="mt-2 h-4 w-full max-w-sm" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
