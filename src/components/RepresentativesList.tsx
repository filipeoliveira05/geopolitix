"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { legislatorFullName, type TermWithLegislator } from "@/lib/legislators-data";
import { PartyBadge } from "@/components/PartyBadge";

type RepresentativesListProps = {
  representatives: TermWithLegislator[];
  selectedDistrict: number | null;
};

export function RepresentativesList({
  representatives,
  selectedDistrict,
}: RepresentativesListProps) {
  const selectedRef = useRef<HTMLLIElement | null>(null);

  // A large state's list can scroll past the selected district — bring it
  // into view when the map selection changes instead of leaving it hidden.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedDistrict]);

  return (
    <ul className="mt-1 flex max-h-64 flex-col gap-1 overflow-y-auto">
      {representatives.map(({ legislator, term }) => {
        const isSelected = term.district === selectedDistrict;
        return (
          <li
            key={legislator.id}
            ref={isSelected ? selectedRef : undefined}
            className={
              isSelected
                ? "-mx-1 rounded border-l-2 border-amber-400 bg-amber-200 px-1 font-medium dark:border-amber-300 dark:bg-amber-300/35"
                : undefined
            }
          >
            {term.district === 0 ? "At-large" : `District ${term.district}`}:{" "}
            <Link href={`/legislator/${legislator.id}`} className="hover:underline">
              {legislatorFullName(legislator)}
            </Link>{" "}
            <PartyBadge party={term.party} />
          </li>
        );
      })}
    </ul>
  );
}
