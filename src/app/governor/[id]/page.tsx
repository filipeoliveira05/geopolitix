import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getStateName } from "@/lib/states";
import { getGovernorById, governorFullName } from "@/lib/governors-data";
import { PartyBadge } from "@/components/PartyBadge";

export async function generateMetadata(props: PageProps<"/governor/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const governor = await getGovernorById(id);
  return {
    title: governor ? `${governorFullName(governor)} — Geopolitix` : "Geopolitix",
  };
}

export default async function GovernorPage(props: PageProps<"/governor/[id]">) {
  const { id } = await props.params;
  const governor = await getGovernorById(id);
  if (!governor) notFound();

  const stateName = getStateName(governor.stateId) ?? governor.stateId;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-6 sm:p-10">
      <Link
        href="/"
        className="text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        ← Back to map
      </Link>

      <div className="mt-2 flex items-center gap-4">
        {governor.photoUrl && (
          <Image
            src={governor.photoUrl}
            alt=""
            width={80}
            height={80}
            unoptimized
            className="h-20 w-20 rounded object-cover"
          />
        )}
        <div>
          <h1 className="text-3xl font-semibold">{governorFullName(governor)}</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            <PartyBadge party={governor.party} /> Governor of{" "}
            <Link href={`/state/${governor.stateId}`} className="hover:underline">
              {stateName}
            </Link>
          </p>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Biography
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {governor.bioSummary ?? "Not synced yet."}
        </p>
      </div>

      <div className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Term
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {governor.startDate ?? governor.endDate
            ? `${governor.startDate ?? "?"} – ${governor.endDate ?? "present"}`
            : "Term dates not available from OpenStates (see plan §3) — current officeholder only, no history modeled yet."}
        </p>
      </div>
    </div>
  );
}
