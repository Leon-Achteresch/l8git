import i18n from "@/lib/i18n";

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function mondayStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function historySectionTitleResolver(now = new Date()): (iso: string) => string {
  const nd = startOfLocalDay(now);
  const ws = mondayStart(now).getTime();
  const earlier = i18n.t("commitHistory.earlier");
  const today = i18n.t("commitHistory.today");
  const yesterday = i18n.t("commitHistory.yesterday");
  const thisWeek = i18n.t("commitHistory.thisWeek");
  return (iso) => {
    const t = new Date(iso);
    if (isNaN(t.getTime())) return earlier;
    const cd = startOfLocalDay(t);
    const diffDays = Math.round((nd - cd) / 86400000);
    if (diffDays === 0) return today;
    if (diffDays === 1) return yesterday;
    if (cd >= ws && cd < nd) return thisWeek;
    return earlier;
  };
}

export function historySectionTitle(iso: string, now = new Date()): string {
  return historySectionTitleResolver(now)(iso);
}
