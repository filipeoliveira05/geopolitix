import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-3 p-6 text-center sm:p-10">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        There&apos;s nothing here — the page or record you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
      >
        Back to map
      </Link>
    </div>
  );
}
