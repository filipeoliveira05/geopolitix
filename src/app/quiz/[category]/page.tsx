import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getQuizCategory } from "@/lib/quiz/category-config";
import { QuizCategoryClient } from "@/components/quiz/QuizCategoryClient";

export async function generateMetadata(
  props: PageProps<"/quiz/[category]">,
): Promise<Metadata> {
  const { category: categoryId } = await props.params;
  const category = getQuizCategory(categoryId);
  return { title: category ? `${category.label} Quiz — Geopolitix` : "Geopolitix" };
}

export default async function QuizCategoryPage(props: PageProps<"/quiz/[category]">) {
  const { category: categoryId } = await props.params;
  const category = getQuizCategory(categoryId);
  if (!category) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 animate-fade-in p-6 sm:p-10">
      <QuizCategoryClient category={category} />
    </div>
  );
}
