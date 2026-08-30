import { supabase } from "./supabase";
import type { RaceOffice } from "./races-data";

// Reads the Supabase `candidates` table (synced via scripts/sync/races-2026.mjs's
// bio-backfill pass) — a candidate with no existing legislators/governors
// profile. See docs/superpowers/specs/2026-08-29-candidate-profiles-design.md.

export type Candidate = {
  id: string;
  name: string;
  stateId: string;
  bioSummary: string | null;
  photoUrl: string | null;
  wikipediaVerified: boolean;
  race: {
    office: RaceOffice;
    stateId: string;
    districtNumber: number | null;
    party: string | null;
    isIncumbent: boolean;
  } | null;
};

type CandidateRow = {
  id: string;
  name: string;
  state_id: string;
  bio_summary: string | null;
  photo_url: string | null;
  wikipedia_verified: boolean;
  race_candidates: {
    party: string | null;
    is_incumbent: boolean;
    races_2026: {
      office: RaceOffice;
      state_id: string;
      district_number: number | null;
    } | null;
  }[];
};

export async function getCandidateById(id: string): Promise<Candidate | null> {
  const { data, error } = await supabase
    .from("candidates")
    .select(
      "id, name, state_id, bio_summary, photo_url, wikipedia_verified, " +
        // race_candidates has two FKs into races_2026 (race_id and
        // winner_candidate_id) — PostgREST can't infer which one to embed
        // on without being told explicitly (same disambiguation
        // races-data.ts's RACE_WITH_CANDIDATES_SELECT already needs).
        "race_candidates!race_candidates_candidate_id_fkey(party, is_incumbent, races_2026!race_candidates_race_id_fkey(office, state_id, district_number))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as CandidateRow;
  const raceCandidate = row.race_candidates[0];

  return {
    id: row.id,
    name: row.name,
    stateId: row.state_id,
    bioSummary: row.bio_summary,
    photoUrl: row.photo_url,
    wikipediaVerified: row.wikipedia_verified,
    race:
      raceCandidate?.races_2026
        ? {
            office: raceCandidate.races_2026.office,
            stateId: raceCandidate.races_2026.state_id,
            districtNumber: raceCandidate.races_2026.district_number,
            party: raceCandidate.party,
            isIncumbent: raceCandidate.is_incumbent,
          }
        : null,
  };
}
