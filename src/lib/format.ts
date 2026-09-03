// Plain string manipulation, not `toLocaleString`/`Intl.NumberFormat` — those pick their group
// separator character from the runtime's locale/ICU data, which isn't guaranteed to agree between
// the Node server (SSR) and the browser (hydration), and even a plain-looking " " grouping can
// come out as a different whitespace character (e.g. U+202F narrow no-break space) depending on
// ICU version, causing a hydration mismatch — a real one, caught live via a "4,148,818" vs.
// "4 148 818" mismatch on /state/[abbr]. A fixed regex-based space insertion is byte-identical on
// every render, everywhere.
export function formatPopulation(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
