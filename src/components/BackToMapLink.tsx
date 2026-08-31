import Link from "next/link";

export function BackToMapLink() {
  return (
    <Link href="/" className="text-sm text-muted hover:text-ink">
      ← Back to map
    </Link>
  );
}
