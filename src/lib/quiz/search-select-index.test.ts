import { describe, it, expect } from "vitest";
import {
  buildCityEntries,
  buildSenatorEntries,
  buildTeamEntries,
  createEntitySearch,
} from "./search-select-index";
import type { CityFact, SportsTeam } from "@/lib/geography-data";
import type { TermWithLegislator } from "@/lib/legislators-data";

describe("buildCityEntries", () => {
  it("labels each city by its plain name, with no state suffix (would spoil the answer)", () => {
    const cities: CityFact[] = [
      { cityId: "c1", cityName: "Portland", stateId: "OR", stateName: "Oregon", population: 1, isCapital: false },
      { cityId: "c2", cityName: "Portland", stateId: "ME", stateName: "Maine", population: 1, isCapital: false },
    ];
    expect(buildCityEntries(cities)).toEqual([
      { id: "c1", label: "Portland" },
      { id: "c2", label: "Portland" },
    ]);
  });
});

describe("buildSenatorEntries", () => {
  it("flattens every state's senators into one entry list", () => {
    const senatorsByState = new Map<string, TermWithLegislator[]>([
      [
        "TX",
        [
          {
            legislator: {
              id: "L1",
              bioguideId: "L1",
              govtrackId: null,
              firstName: "Amy",
              lastName: "Adams",
              photoUrl: null,
              birthday: null,
              bioSummary: null,
              wikipediaTitle: null,
              wikipediaVerified: false,
              wikipediaCheckedNo: false,
              lastSyncedAt: null,
            },
            term: {
              id: "t1",
              legislatorId: "L1",
              chamber: "senate",
              stateId: "TX",
              district: null,
              party: "Democrat",
              startDate: "2023-01-03",
              endDate: null,
              isCurrent: true,
            },
          },
        ],
      ],
    ]);
    expect(buildSenatorEntries(senatorsByState)).toEqual([{ id: "L1", label: "Amy Adams" }]);
  });
});

describe("buildTeamEntries", () => {
  it("labels each team by its own name", () => {
    const teams: SportsTeam[] = [
      {
        id: "t1",
        name: "Cowboys",
        league: "NFL",
        cityName: "Arlington",
        stateId: "TX",
        wikipediaTitle: null,
        logoUrl: null,
        bioSummary: null,
        lastSyncedAt: null,
      },
    ];
    expect(buildTeamEntries(teams)).toEqual([
      { id: "t1", label: "Cowboys", photoUrl: null, league: "NFL" },
    ]);
  });

  it("carries the team's synced logo as photoUrl", () => {
    const teams: SportsTeam[] = [
      {
        id: "t1",
        name: "Cowboys",
        league: "NFL",
        cityName: "Arlington",
        stateId: "TX",
        wikipediaTitle: null,
        logoUrl: "https://example.com/cowboys.png",
        bioSummary: null,
        lastSyncedAt: null,
      },
    ];
    expect(buildTeamEntries(teams)[0].photoUrl).toBe("https://example.com/cowboys.png");
  });
});

describe("createEntitySearch", () => {
  const search = createEntitySearch([
    { id: "1", label: "Houston" },
    { id: "2", label: "San Antonio" },
    { id: "3", label: "Austin" },
  ]);

  it("returns fuzzy matches for a query", () => {
    expect(search("housto").map((e) => e.id)).toContain("1");
  });

  it("returns an empty array for a blank query", () => {
    expect(search("")).toEqual([]);
    expect(search("   ")).toEqual([]);
  });

  it("caps results at maxResults", () => {
    const manyEntries = Array.from({ length: 20 }, (_, i) => ({ id: String(i), label: `City${i}` }));
    const manySearch = createEntitySearch(manyEntries);
    expect(manySearch("City", 5)).toHaveLength(5);
  });
});
