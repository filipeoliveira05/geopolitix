export function SectionHeading({
  children,
  as: Tag = "h2",
  className = "",
}: {
  children: React.ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <Tag className={`text-xs font-semibold uppercase tracking-wide text-muted ${className}`}>
      <span className="mr-1 text-seal" aria-hidden="true">
        §
      </span>
      {children}
    </Tag>
  );
}
