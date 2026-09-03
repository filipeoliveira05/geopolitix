import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCollegeFootballProgramById } from "@/lib/geography-data";
import { TeamProfile } from "@/components/TeamProfile";

export async function generateMetadata(
  props: PageProps<"/college-football/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const program = await getCollegeFootballProgramById(id);
  return { title: program ? `${program.school} — Geopolitix` : "Geopolitix" };
}

export default async function CollegeFootballProgramPage(
  props: PageProps<"/college-football/[id]">,
) {
  const { id } = await props.params;
  const program = await getCollegeFootballProgramById(id);
  if (!program) notFound();

  return (
    <TeamProfile
      team={{
        name: program.school,
        nickname: program.nickname,
        logoUrl: program.logoUrl,
        cityName: program.cityName,
        stateId: program.stateId,
        categoryLabel: program.conference ?? "NCAA Division I FBS",
        bioSummary: program.bioSummary,
        wikipediaTitle: program.wikipediaTitle,
        lastSyncedAt: program.lastSyncedAt,
      }}
      syncLabel="This program"
    />
  );
}
