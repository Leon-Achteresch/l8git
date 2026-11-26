import i18n from "@/lib/i18n";

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const dateStyles = {
  absolute: { dateStyle: "short", timeStyle: "medium" },
  withinYear: { day: "numeric", month: "short" },
  withYear: { day: "numeric", month: "short", year: "numeric" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

function getDateFormatter(style: keyof typeof dateStyles): Intl.DateTimeFormat {
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const key = `${locale}|${style}`;
  let fmt = dateFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, dateStyles[style]);
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
  return getDateFormatter("absolute").format(d);
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
  return getDateFormatter(sameYear ? "withinYear" : "withYear").format(d);
}
