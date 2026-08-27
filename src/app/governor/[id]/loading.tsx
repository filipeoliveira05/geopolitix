import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-6 sm:p-10">
      <Skeleton className="h-4 w-24" />

      <div className="mt-2 flex items-center gap-4">
        <Skeleton className="h-20 w-20 shrink-0 rounded" />
        <div className="flex-1">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
      </div>

      <div className="mt-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-4 w-full max-w-md" />
      </div>

      <div className="mt-6">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-2 h-4 w-full max-w-md" />
      </div>
    </div>
  );
}
