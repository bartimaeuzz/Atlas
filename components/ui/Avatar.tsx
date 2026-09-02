function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <div
      // Brand indigo, not functional primary (2026-08-24, Oliver) -- the
      // initials circle is identity chrome like the logo square above it,
      // not an action, so it wears the same colour the logo does.
      className="rounded-[var(--radius-full)] bg-[var(--brand)] text-white font-medium flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: Math.max(13, size * 0.4) }}
    >
      {initialsFor(name)}
    </div>
  );
}
