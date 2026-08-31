import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-6 sm:p-10">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-2 h-9 w-56" />
      <Skeleton className="mt-2 h-4 w-full max-w-lg" />

      <div className="mt-6 grid grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="rounded border border-rule bg-surface p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-6 w-20" />
          </div>
        ))}
      </div>

      {[0, 1].map((i) => (
        <div key={i} className="mt-8">
          <Skeleton className="h-3 w-32" />
          <div className="mt-2 flex flex-col gap-2">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} className="h-5 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
