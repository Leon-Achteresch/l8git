export function compactAge(
  timestampSeconds: number,
  locale: string,
  nowMs: number = Date.now(),
): string {
  const seconds = Math.max(0, Math.round(nowMs / 1000 - timestampSeconds));
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 86_400) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (seconds < 604_800) return `${Math.max(1, Math.round(seconds / 86_400))}d`;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
  }).format(timestampSeconds * 1000);
}
