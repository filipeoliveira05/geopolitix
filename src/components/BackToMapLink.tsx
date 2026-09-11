import Link from "next/link";

export function BackToMapLink({
  href = "/",
  children = "← Back to map",
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link href={href} className="text-sm text-muted hover:text-ink">
      {children}
    </Link>
  );
}
