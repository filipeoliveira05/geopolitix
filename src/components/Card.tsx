export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`rounded border border-rule bg-surface p-4 ${className}`}>{children}</div>;
}
