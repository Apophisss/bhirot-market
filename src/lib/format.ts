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
 * Whole points, always.
 *
 * The engine works in real numbers — a sale, a payout and a profit/loss line all
 * land on hundredths — and the formatter used to print every one of them: a
 * header reading "שווי 10,000.05 נק׳", a portfolio reading "8,905.09" beside
 * "ממומש +0.09 נק׳ · לא ממומש -0.04 נק׳", and twenty-two open positions each
 * showing "0.00 נק׳". Two decimal places of a play-money score are not
 * information; they are the accounting of a game that has none, and they made
 * every number on the page harder to read in order to say nothing.
 *
 * So the hundredths stay in the engine and stop at the screen. Rounding, never
 * truncation — a score is never quietly shaved — and `|| 0` folds -0 (a negative
 * sliver) back to plain zero, because zero has no sign.
 *
 * `compact` keeps the short K/M overview form volume needs.
 */
export function money(v: number, opts: { compact?: boolean } = {}): string {
  const abs = Math.abs(v);
  if (opts.compact) {
    if (abs >= 1_000_000) return `${nf1.format(v / 1_000_000)}M ${POINTS_SHORT}`;
    if (abs >= 10_000) return `${nf1.format(v / 1_000)}K ${POINTS_SHORT}`;
  }
  return `${nf0.format(points(v))} ${POINTS_SHORT}`;
}

/**
 * A profit/loss amount with its sign — and only when it has one.
 *
 * The rounding happens BEFORE the sign is chosen, which is the whole point: a
 * position that moved by two hundredths of a point is displayed as "0", and "-0"
 * is a number wearing a sign it does not have. Below half a point in either
 * direction the amount is simply zero, and zero is unsigned.
 */
export function signedMoney(v: number): string {
  const s = money(Math.abs(points(v)));
  const sign = pnlSign(v);
  return sign > 0 ? `+${s}` : sign < 0 ? `-${s}` : s;
}

/** An amount as the screen shows it: whole points. `|| 0` folds -0 (a negative sliver) back to 0. */
function points(v: number): number {
  return (Number.isFinite(v) ? Math.round(v) : 0) || 0;
}

/**
 * The direction a profit/loss should be *shown* in, after rounding: 1, -1 or 0.
 *
 * Every green/red decision goes through this rather than `v >= 0`, so a value
 * the formatter prints as "0" is never painted as a win or as a loss — the two
 * would otherwise disagree on the same line.
 */
export function pnlSign(v: number): -1 | 0 | 1 {
  const whole = points(v);
  return whole > 0 ? 1 : whole < 0 ? -1 : 0;
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
 * page prints as 0.0% must not be shown as a gain or a loss. And a return smaller
 * than a tenth of a percent is not shown as a number at all: "0%" beside a
 * profit is a claim about performance that the digit cannot support, so it
 * becomes an em dash — nothing has happened yet.
 */
export function signedPct(ratio: number): string {
  const tenths = (Number.isFinite(ratio) ? Math.round(ratio * 1000) : 0) || 0;
  if (tenths === 0) return "—";
  const body = `${nf1.format(Math.abs(tenths) / 10)}%`;
  return tenths > 0 ? `+${body}` : `-${body}`;
}

export function shares(v: number): string {
  return nf1.format(v);
}

/**
 * What a quantity of a holding is called.
 *
 * It used to be called "תשובות", because a share on this board is bought by
 * answering — and the result was a portfolio row reading "לא · 141.4 תשובות" for
 * a single tap on a single question, a panel asking for "תשובות להחזרה (יש לך
 * 141.4)", and a confirm button offering "20 נק׳ · 27.9 תשובות". A player who
 * answered once was told they held a hundred and forty-one answers.
 *
 * So the word "תשובה" is kept for the act — one question, one answer — and the
 * quantity behind it gets a name of its own. Wherever the quantity is really a
 * payout (what the holding pays if the answer was right, which on this board is
 * the same number), the screen says points instead and skips the unit entirely.
 */
export const UNITS_LABEL = "יחידות";

export function units(v: number): string {
  return `${nf1.format(v)} ${UNITS_LABEL}`;
}

/** what one answer costs, in points (0.42 -> "0.42 נק׳") — the same unit as every other amount on the site */
export function sharePrice(price: number): string {
  return `${nf2.format(price)} ${POINTS_SHORT}`;
}

/*
  Pinned to Israel time. The server runs in UTC (node:22-alpine sets no TZ), and a
  question closing at midnight Israel time is 21:00 UTC the day before: without the
  zone the server printed one calendar day and every phone in Israel printed the
  next — a hydration mismatch (React #418) on every load of any page that shows the
  date, and a wrong date on every server-rendered one.
*/
const TZ = "Asia/Jerusalem";
const dtf = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const dtfShort = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, day: "numeric", month: "short" });
const dtfTime = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

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
