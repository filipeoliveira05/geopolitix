import { supabase } from "./supabase";
import { getStateName } from "./states";

export type HouseSeatCountFact = {
  stateId: string;
  stateName: string;
  seatCount: number;
};

/**
 * How many current (119th Congress) U.S. House seats each state has — powers the quiz's
 * Officeholders category. Derived by counting rows in the `districts` metadata table (Census
 * GEOID rows, no geometry — geometry itself lives in Storage, see CLAUDE.md's districts entry)
 * rather than counting occupied `terms` rows, since a vacancy would silently undercount a
 * state's real apportionment.
 */
export async function getHouseSeatCountsByState(): Promise<HouseSeatCountFact[]> {
  const { data, error } = await supabase.from("districts").select("state_id");
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data as { state_id: string }[]) {
    counts.set(row.state_id, (counts.get(row.state_id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([stateId, seatCount]): HouseSeatCountFact | null => {
      const stateName = getStateName(stateId);
      if (!stateName) return null;
      return { stateId, stateName, seatCount };
    })
    .filter((f): f is HouseSeatCountFact => f !== null);
}
