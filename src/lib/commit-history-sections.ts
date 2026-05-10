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

export function historySectionTitle(iso: string, now = new Date()): string {
  const t = new Date(iso);
  if (isNaN(t.getTime())) return "FRÜHER";
  const cd = startOfLocalDay(t);
  const nd = startOfLocalDay(now);
  const diffDays = Math.round((nd - cd) / 86400000);
  if (diffDays === 0) return "HEUTE";
  if (diffDays === 1) return "GESTERN";
  const ws = mondayStart(now).getTime();
  if (cd >= ws && cd < nd) return "DIESE WOCHE";
  return "FRÜHER";
}
