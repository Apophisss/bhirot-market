const nf0 = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function pct(p: number, digits = 0): string {
  const v = p * 100;
  if (v > 0 && v < 1) return "<1%";
  if (v > 99 && v < 100) return ">99%";
  return `${digits ? nf1.format(v) : nf0.format(v)}%`;
}

/**
 * virtual shekels. Amounts here are real numbers, not whole shekels: a sale, a
 * payout and a P&L line all land on agorot, and a win of ₪0.37 is a win — so the
 * agorot are shown whenever the amount has any, and dropped when it has none
 * (₪10,000 stays ₪10,000). `decimals` pins them on even for a round amount;
 * `compact` keeps the short overview form for volume and only falls back to
 * agorot below ₪1, where rounding would erase the amount to "₪0" altogether.
 */
export function money(v: number, opts: { compact?: boolean; decimals?: boolean } = {}): string {
  const abs = Math.abs(v);
  if (opts.compact) {
    if (abs >= 1_000_000) return `₪${nf1.format(v / 1_000_000)}M`;
    if (abs >= 10_000) return `₪${nf1.format(v / 1_000)}K`;
    if (abs >= 1) return `₪${nf0.format(v)}`;
  }
  // round to agorot first, so the shekels and the agorot never disagree.
  // `|| 0` turns -0 (anything under half an agora, negative) back into 0.
  const agorot = Math.round(v * 100) || 0;
  const value = agorot / 100;
  return `₪${opts.decimals || agorot % 100 !== 0 ? nf2.format(value) : nf0.format(value)}`;
}

export function signedMoney(v: number): string {
  const s = money(Math.abs(v), { decimals: true });
  return v >= 0 ? `+${s}` : `-${s}`;
}

export function shares(v: number): string {
  return nf1.format(v);
}

/** price of one share, in virtual shekels (0.42 -> ₪0.42) — the same currency as every other amount on the site */
export function sharePrice(price: number): string {
  return `₪${nf2.format(price)}`;
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
