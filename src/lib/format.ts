export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 45) return "gerade eben";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `vor ${diffMin}m`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `vor ${diffHour}h`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 7) return `vor ${diffDay}d`;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("de-DE", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
}
