import i18n from "@/lib/i18n";

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function getDateFormatter(
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale ?? ""}|${JSON.stringify(options)}`;
  let fmt = dateFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, options);
    dateFormatters.set(key, fmt);
  }
  return fmt;
}

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
  return getDateFormatter(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(d);
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 45) return i18n.t("time.justNow");
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return i18n.t("time.minutesAgo", { count: diffMin });
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return i18n.t("time.hoursAgo", { count: diffHour });
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 7) return i18n.t("time.daysAgo", { count: diffDay });
  const sameYear = d.getFullYear() === now.getFullYear();
  const locTag = i18n.language === "en" ? "en-US" : "de-DE";
  return getDateFormatter(locTag, {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  }).format(d);
}
