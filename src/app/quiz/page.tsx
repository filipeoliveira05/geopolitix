import Link from "next/link";
import type { Metadata } from "next";
import { QUIZ_CATEGORIES } from "@/lib/quiz/category-config";
import { BackToMapLink } from "@/components/BackToMapLink";

export const metadata: Metadata = { title: "Quiz — Geopolitix" };

export default function QuizHubPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 animate-fade-in p-6 sm:p-10">
      <BackToMapLink />
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Quiz</h1>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {QUIZ_CATEGORIES.map((category) =>
          category.enabled ? (
            <Link
              key={category.id}
              href={`/quiz/${category.id}`}
              className="rounded border border-rule bg-surface p-4 hover:border-seal"
            >
              <h2 className="font-display text-lg font-semibold text-ink">{category.label}</h2>
              <p className="mt-1 text-sm text-muted">{category.description}</p>
            </Link>
          ) : (
            <div key={category.id} className="rounded border border-rule bg-surface p-4 opacity-50">
              <h2 className="font-display text-lg font-semibold text-ink">{category.label}</h2>
              <p className="mt-1 text-sm text-muted">Coming soon</p>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
