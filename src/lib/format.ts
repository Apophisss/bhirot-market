const nf0 = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * What the score is called, on every screen.
 *
 * Short form for anything next to a number (a chip, a table cell, a button), long
 * form for prose. Both live here so the two can never drift apart, and so there is
 * one place to look when someone asks what the unit is called.
 */
export const POINTS_SHORT = "נק׳";
export const POINTS_LABEL = "נקודות";

export function pct(p: number, digits = 0): string {
  const v = p * 100;
  if (v > 0 && v < 1) return "<1%";
  if (v > 99 && v < 100) return ">99%";
  return `${digits ? nf1.format(v) : nf0.format(v)}%`;
}

/**
 * The score, in game points.
 *
 * The unit used to be printed as virtual shekels. It is the same number — the
 * engine, the balances and the payouts are untouched — but a free knowledge game
 * that denominates itself in ₪ describes itself as something it is not, and reads
 * to both a visitor and an ad reviewer as money changing hands. Points are what it
 * actually is: a score you cannot deposit, withdraw or cash out.
 *
 * Amounts are real numbers, not whole points: a sale, a payout and a profit/loss
 * line all land on hundredths, and a win of 0.37 is a win — so the fraction is
 * shown whenever the amount has one, and dropped when it has none (10,000 stays
 * 10,000). `decimals` pins it on even for a round amount; `compact` keeps the
 * short overview form for volume and only falls back to hundredths below 1,
 * where rounding would erase the amount to "0" altogether.
 */
export function money(v: number, opts: { compact?: boolean; decimals?: boolean } = {}): string {
  const abs = Math.abs(v);
  if (opts.compact) {
    if (abs >= 1_000_000) return `${nf1.format(v / 1_000_000)}M ${POINTS_SHORT}`;
    if (abs >= 10_000) return `${nf1.format(v / 1_000)}K ${POINTS_SHORT}`;
    if (abs >= 1) return `${nf0.format(v)} ${POINTS_SHORT}`;
  }
  // round to hundredths first, so the whole points and the fraction never disagree.
  // `|| 0` turns -0 (anything under half a hundredth, negative) back into 0.
  const agorot = Math.round(v * 100) || 0;
  const value = agorot / 100;
  return `${opts.decimals || agorot % 100 !== 0 ? nf2.format(value) : nf0.format(value)} ${POINTS_SHORT}`;
}

/**
 * A profit/loss amount with its sign — and only when it has one.
 *
 * The rounding happens BEFORE the sign is chosen, which is the whole point: a
 * round trip that cost a fraction of a hundredth is displayed as "0.00", and
 * "-0.00" is a number wearing a sign it does not have. Below half a hundredth in
 * either direction the amount is simply zero, and zero is unsigned.
 */
export function signedMoney(v: number): string {
  const s = money(Math.abs(pnlAgorot(v)) / 100, { decimals: true });
  const sign = pnlSign(v);
  return sign > 0 ? `+${s}` : sign < 0 ? `-${s}` : s;
}

/** A profit/loss rounded to whole hundredths. `|| 0` folds -0 (a negative sliver) back to 0. */
function pnlAgorot(v: number): number {
  return (Number.isFinite(v) ? Math.round(v * 100) : 0) || 0;
}

/**
 * The direction a profit/loss should be *shown* in, after rounding: 1, -1 or 0.
 *
 * Every green/red decision goes through this rather than `v >= 0`, so a value
 * the formatter prints as "0.00" is never painted as a win or as a loss — the two
 * would otherwise disagree on the same line.
 */
export function pnlSign(v: number): -1 | 0 | 1 {
  const agorot = pnlAgorot(v);
  return agorot > 0 ? 1 : agorot < 0 ? -1 : 0;
}

/** Tailwind text colour for a profit/loss: muted at a displayed zero, never green or red. */
export function pnlTone(v: number): "text-yes" | "text-no" | "text-muted" {
  const sign = pnlSign(v);
  return sign > 0 ? "text-yes" : sign < 0 ? "text-no" : "text-muted";
}

/**
 * A profit/loss as a signed percentage of the points behind it (0.0123 -> "+1.2%").
 *
 * Rounds before choosing the sign, exactly as `signedMoney` does — a return the
 * page prints as 0.0% must not be shown as a gain or a loss.
 */
export function signedPct(ratio: number): string {
  const tenths = (Number.isFinite(ratio) ? Math.round(ratio * 1000) : 0) || 0;
  const body = `${nf1.format(Math.abs(tenths) / 10)}%`;
  return tenths > 0 ? `+${body}` : tenths < 0 ? `-${body}` : body;
}

export function shares(v: number): string {
  return nf1.format(v);
}

/** what one answer costs, in points (0.42 -> "0.42 נק׳") — the same unit as every other amount on the site */
export function sharePrice(price: number): string {
  return `${nf2.format(price)} ${POINTS_SHORT}`;
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
