import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getStateName } from "@/lib/states";
import { getGovernorById, getTermsForGovernor, governorFullName } from "@/lib/governors-data";
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
  const terms = await getTermsForGovernor(id, governor.stateId);

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
          Term history
        </h2>
        {terms.length > 0 ? (
          <div className="mt-1 overflow-x-auto overflow-y-hidden">
            <table className="w-full min-w-[26rem] border-collapse text-sm">
              <tbody>
                {terms.map((term) => (
                  <tr
                    key={term.id}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                  >
                    <td className="w-px py-1.5 pr-1.5 align-middle">
                      {term.isCurrent && (
                        <span
                          className="block h-1.5 w-1.5 rounded-full bg-emerald-500"
                          title="Current term"
                        />
                      )}
                    </td>
                    <td className="py-1.5 pr-3 align-middle">Governor of {stateName}</td>
                    <td className="w-px py-1.5 pr-3 align-middle whitespace-nowrap">
                      <PartyBadge party={term.party} />
                    </td>
                    <td className="py-1.5 text-right align-middle whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                      {term.startDate ?? "?"} – {term.endDate ?? (term.isCurrent ? "present" : "?")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Term dates not available — OpenStates has no history, and this person&apos;s Wikidata
            term record didn&apos;t match cleanly (see sync_logs).
          </p>
        )}
      </div>
    </div>
  );
}
