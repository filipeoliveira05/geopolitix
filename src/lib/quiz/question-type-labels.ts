// Human-readable labels for each generator's stable questionType id (see docs/quiz-notes.md's
// 2026-09-08 entry) — used only for display on /quiz/history. Falls back to the raw id for any
// type not yet listed here, so a new generator can't silently break the page.
const QUESTION_TYPE_LABELS: Record<string, string> = {
  "geography.capital": "State capitals",
  "geography.flag": "State flags",
  "geography.silhouette": "State silhouettes",
  "geography.non_border": "Non-bordering states",
  "geography.border_recall": "Name a state's borders",
  "geography.abbreviation": "State abbreviations",
  "geography.city_state": "Which state is this city in?",
  "geography.is_capital": "Is this the capital?",
  "geography.largest_city": "Largest city in a state",
  "geography.is_largest_city": "Is this the largest city?",
  "geography.population_compare_state": "State population comparisons",
  "geography.population_compare_city": "City population comparisons",
  "geography.city_recall": "Name a state's cities",
  "geography.map_click": "Click the state on the map",

  "officeholders.governor": "Governor recognition",
  "officeholders.photo_state": "Officeholder photo → state",
  "officeholders.party": "Officeholder party",
  "officeholders.name_guess": "Name the officeholder",
  "officeholders.chamber": "Senate vs. House",
  "officeholders.house_seat_count": "House seat counts",
  "officeholders.senator_recall": "Name a state's senators",

  "midterms.party": "Candidate party",
  "midterms.incumbency": "Incumbent or challenger",
  "midterms.candidate_recall": "Name a race's candidates",

  "sports.team_logo": "Team logo recognition",
  "sports.team_state": "Which state is this team in?",
  "sports.league": "Which league?",
  "sports.team_city": "Which city is this team in?",
  "sports.team_by_city": "Which team is based in this city?",
  "sports.team_by_state": "Which team is based in this state?",
  "sports.school_nickname": "School nicknames",
  "sports.college_conference": "College conferences",
  "sports.college_city": "Which city is this college in?",
  "sports.college_by_city": "Which college is based in this city?",
  "sports.college_by_state": "Which college is based in this state?",
  "sports.pro_team_count": "Pro teams per state",
  "sports.college_program_count": "Power-4 programs per state",
  "sports.state_team_recall": "Name a state's teams",

  "mashups.odd_one_out": "Odd one out",
};

export function questionTypeLabel(questionType: string): string {
  return QUESTION_TYPE_LABELS[questionType] ?? questionType;
}
