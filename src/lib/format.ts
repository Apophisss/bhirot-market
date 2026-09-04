const nf0 = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function pct(p: number, digits = 0): string {
  const v = p * 100;
  if (v > 0 && v < 1) return "<1%";
  if (v > 99 && v < 100) return ">99%";
  return `${digits ? nf1.format(v) : nf0.format(v)}%`;
}

/** virtual shekels */
export function money(v: number, opts: { compact?: boolean; decimals?: boolean } = {}): string {
  const abs = Math.abs(v);
  if (opts.compact) {
    if (abs >= 1_000_000) return `₪${nf1.format(v / 1_000_000)}M`;
    if (abs >= 10_000) return `₪${nf1.format(v / 1_000)}K`;
  }
  return `₪${opts.decimals ? nf2.format(v) : nf0.format(v)}`;
}

export function signedMoney(v: number): string {
  const s = money(Math.abs(v), { decimals: true });
  return v >= 0 ? `+${s}` : `-${s}`;
}

export function shares(v: number): string {
  return nf1.format(v);
}

export function agora(price: number): string {
  // price per share, in "agorot" (0.42 -> 42¢) like Polymarket's cents
  return `${nf0.format(price * 100)}¢`;
}

const dtf = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", year: "numeric" });
const dtfShort = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" });
const dtfTime = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function fmtDate(d: Date | number | string): string {
  return dtf.format(new Date(d));
}
export function fmtDateShort(d: Date | number | string): string {
  return dtfShort.format(new Date(d));
}
export function fmtDateTime(d: Date | number | string): string {
  return dtfTime.format(new Date(d));
}

export function timeAgo(d: Date | number | string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(d).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "עכשיו";
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.floor(m / 60);
  if (h < 24) return `לפני ${h} שע׳`;
  const days = Math.floor(h / 24);
  if (days < 30) return `לפני ${days} ימים`;
  return fmtDate(d);
}

export function daysUntil(d: Date | number | string, now = Date.now()): number {
  return Math.ceil((new Date(d).getTime() - now) / 86_400_000);
}

export function hoursUntil(d: Date | number | string, now = Date.now()): number {
  return (new Date(d).getTime() - now) / 3_600_000;
}

export function closesLabel(closesAt: Date | number | string, now = Date.now()): string {
  const hours = hoursUntil(closesAt, now);
  if (hours <= 0) return "נסגר";
  if (hours < 1) return `נסגר בעוד ${Math.max(1, Math.round(hours * 60))} דק׳`;
  if (hours < 24) return `נסגר בעוד ${Math.round(hours)} שעות`;
  const days = daysUntil(closesAt, now);
  if (days === 1) return "נסגר מחר";
  if (days <= 30) return `נסגר בעוד ${days} ימים`;
  return `נסגר ב־${fmtDate(closesAt)}`;
}
