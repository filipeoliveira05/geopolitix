"use client";

import { useTheme } from "@/lib/theme";

const LABELS = {
  system: "System",
  light: "Light",
  dark: "Dark",
} as const;

const NEXT_LABEL = {
  system: "light",
  light: "dark",
  dark: "system",
} as const;

// Icons match GlobalHeader's other buttons: outline SVG, currentColor,
// h-5 w-5. One icon per state rather than a single icon that just spins,
// since sun/moon/monitor are each meaningfully different shapes.
function ThemeIcon({ theme }: { theme: keyof typeof LABELS }) {
  if (theme === "light") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    );
  }
  if (theme === "dark") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export function ThemeToggle() {
  const { theme, cycleTheme } = useTheme();

  return (
    <button
      onClick={cycleTheme}
      aria-label={`Theme: ${LABELS[theme]}. Click to switch to ${NEXT_LABEL[theme]}.`}
      title={`Theme: ${LABELS[theme]}`}
      className="rounded p-1.5 text-muted hover:bg-seal-soft hover:text-seal"
    >
      <ThemeIcon theme={theme} />
    </button>
  );
}
