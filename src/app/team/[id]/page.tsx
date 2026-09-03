import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSportsTeamById } from "@/lib/geography-data";
import { TeamProfile } from "@/components/TeamProfile";

export async function generateMetadata(props: PageProps<"/team/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const team = await getSportsTeamById(id);
  return { title: team ? `${team.name} — Geopolitix` : "Geopolitix" };
}

export default async function TeamPage(props: PageProps<"/team/[id]">) {
  const { id } = await props.params;
  const team = await getSportsTeamById(id);
  if (!team) notFound();

  return (
    <TeamProfile
      team={{
        name: team.name,
        nickname: null,
        logoUrl: team.logoUrl,
        cityName: team.cityName,
        stateId: team.stateId,
        categoryLabel: team.league,
        bioSummary: team.bioSummary,
        wikipediaTitle: team.wikipediaTitle,
        lastSyncedAt: team.lastSyncedAt,
      }}
      syncLabel="This team"
    />
  );
}
