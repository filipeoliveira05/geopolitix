import { partyStyle } from "@/lib/party-colors";

export function PartyBadge({ party }: { party: string | null }) {
  const style = partyStyle(party);
  return (
    <span className={`font-medium ${style.textClassName}`} title={party ?? "Unknown party"}>
      ({style.letter})
    </span>
  );
}
