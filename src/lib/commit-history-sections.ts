import i18n from "@/lib/i18n";

export function historySectionTitleResolver(now = new Date()): (iso: string) => string {
  const midnight = (offset: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset).getTime();
  const todayStart = midnight(0);
  const tomorrowStart = midnight(1);
  const yesterdayStart = midnight(-1);
  const weekStart = midnight(-((now.getDay() + 6) % 7));
  const earlier = i18n.t("commitHistory.earlier");
  const today = i18n.t("commitHistory.today");
  const yesterday = i18n.t("commitHistory.yesterday");
  const thisWeek = i18n.t("commitHistory.thisWeek");
  return (iso) => {
    const timestamp = Date.parse(iso);
    if (timestamp >= todayStart && timestamp < tomorrowStart) return today;
    if (timestamp >= yesterdayStart && timestamp < todayStart) return yesterday;
    if (timestamp >= weekStart && timestamp < todayStart) return thisWeek;
    return earlier;
  };
}

export function historySectionTitle(iso: string, now = new Date()): string {
  return historySectionTitleResolver(now)(iso);
}
