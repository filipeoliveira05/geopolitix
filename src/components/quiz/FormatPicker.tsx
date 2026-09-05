"use client";

import type { QuestionFormat } from "@/lib/quiz/types";

const FORMAT_LABELS: Record<QuestionFormat, string> = {
  "multiple-choice": "Multiple Choice",
  "map-click": "Map Click",
  "search-select": "Search & Select",
};

export function FormatPicker({
  availableFormats,
  enabledFormats,
  onToggle,
}: {
  availableFormats: QuestionFormat[];
  enabledFormats: QuestionFormat[];
  onToggle: (format: QuestionFormat) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap justify-center gap-4">
      {availableFormats.map((format) => {
        const checked = enabledFormats.includes(format);
        const isLastEnabled = checked && enabledFormats.length === 1;
        return (
          <label key={format} className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={checked}
              disabled={isLastEnabled}
              onChange={() => onToggle(format)}
              className="h-4 w-4 rounded border-rule"
            />
            {FORMAT_LABELS[format]}
          </label>
        );
      })}
    </div>
  );
}
