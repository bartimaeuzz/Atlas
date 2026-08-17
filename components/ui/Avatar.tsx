function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <div
      className="rounded-[var(--radius-full)] bg-[var(--primary)] text-white font-medium flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initialsFor(name)}
    </div>
  );
}
