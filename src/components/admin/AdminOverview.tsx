import Link from "next/link";
import type { AdminStats } from "@/lib/admin-stats";
import { StatTile } from "@/components/StatTile";
import { ActivityChart } from "./ActivityChart";
import { fmtDateTime, money, pct, timeAgo } from "@/lib/format";

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-3.5 sm:p-4">
      <div className="mb-3">
        <h2 className="font-bold text-text-strong">{title}</h2>
        {hint && <p className="text-[12px] text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Everything the editorial team needs to see about the site, in one screen. */
export function AdminOverview({ stats }: { stats: AdminStats }) {
  const s = stats;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <StatTile label="משתמשים רשומים" value={String(s.users.total)} hint={`${s.users.new7d} נרשמו השבוע · ${s.users.new24h} ביממה`} />
        <StatTile label="שווקים פתוחים" value={String(s.markets.open)} hint={`${s.markets.resolved} הוכרעו · ${s.markets.cancelled} בוטלו`} />
        <StatTile label="מחזור כולל" value={money(s.trading.volume, { compact: true })} hint={`${s.trading.trades} עסקאות · ממוצע ${money(s.trading.avgTrade)}`} />
        <StatTile
          label="חוב הכרעות"
          value={String(s.markets.overdue)}
          hint="שווקים פתוחים שמועד הסגירה שלהם עבר"
          tone={s.markets.overdue > 0 ? "no" : "yes"}
        />
        <StatTile label="פעילות ביממה" value={String(s.trading.trades24h)} hint={`${money(s.trading.volume24h)} מחזור ב-24 שעות`} />
        <StatTile label="סוחרים פעילים השבוע" value={String(s.users.active7d)} hint={`${s.users.traders} משתמשים ביצעו עסקה אי־פעם`} />
        <StatTile label="פוזיציות פתוחות" value={String(s.trading.openPositions)} hint={`שווי ${money(s.trading.positionsValue, { compact: true })} במחירי השוק`} />
        <StatTile
          label="בתיבה"
          value={String(s.inbox.messagesNew + s.inbox.suggestionsPending)}
          hint={`${s.inbox.messagesNew} הודעות חדשות · ${s.inbox.suggestionsPending} הצעות שאלה`}
          tone={s.inbox.messagesNew + s.inbox.suggestionsPending > 0 ? "no" : undefined}
        />
      </div>

      <Panel title="מחזור יומי" hint="שבועיים אחרונים, בשעון ישראל. העבירו עכבר על עמודה לפרטי היום.">
        <ActivityChart daily={s.daily} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`חוב הכרעות (${s.markets.overdue})`} hint="שוק סגור שלא הוכרע הוא באג גלוי למשתמשים.">
          {s.overdueMarkets.length ? (
            <ul className="divide-y divide-border text-sm">
              {s.overdueMarkets.map((m) => (
                <li key={m.id} className="flex items-center gap-2 py-2">
                  <Link href={`/market/${m.id}`} className="min-w-0 flex-1 truncate font-medium text-text hover:text-accent-2">
                    {m.title}
                  </Link>
                  <span className="shrink-0 text-[11px] font-semibold text-no">נסגר {timeAgo(m.closesAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-muted">אין שווקים שממתינים להכרעה. הלוח נקי.</p>
          )}
        </Panel>

        <Panel title="נסגרים בקרוב" hint={`${s.markets.closing24h} ב-24 השעות הקרובות, ${s.markets.closing7d} השבוע.`}>
          {s.closingSoon.length ? (
            <ul className="divide-y divide-border text-sm">
              {s.closingSoon.map((m) => (
                <li key={m.id} className="flex items-center gap-2 py-2">
                  <Link href={`/market/${m.id}`} className="min-w-0 flex-1 truncate font-medium text-text hover:text-accent-2">
                    {m.title}
                  </Link>
                  <span className="tabular shrink-0 text-[11px] text-muted">{pct(m.probability)}</span>
                  <span className="shrink-0 text-[11px] text-muted-2">{fmtDateTime(m.closesAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-muted">אין שווקים פתוחים.</p>
          )}
        </Panel>

        <Panel title="השווקים הנסחרים ביותר">
          {s.topMarkets.length ? (
            <ul className="divide-y divide-border text-sm">
              {s.topMarkets.map((m) => (
                <li key={m.id} className="flex items-center gap-2 py-2">
                  <Link href={`/market/${m.id}`} className="min-w-0 flex-1 truncate font-medium text-text hover:text-accent-2">
                    {m.title}
                  </Link>
                  <span className="tabular shrink-0 text-[11px] font-semibold text-text-strong">{money(m.volume, { compact: true })}</span>
                  <span className="tabular shrink-0 text-[11px] text-muted-2">{m.tradeCount} עסקאות</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-muted">עדיין לא בוצעה אף עסקה.</p>
          )}
        </Panel>

        <Panel title="פילוח לפי קטגוריה">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 text-right font-medium">קטגוריה</th>
                <th className="py-1 text-right font-medium">פתוחים</th>
                <th className="py-1 text-right font-medium">הוכרעו</th>
                <th className="py-1 text-right font-medium">מחזור</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {s.categories.map((c) => (
                <tr key={c.id}>
                  <td className="py-1.5">
                    <Link href={`/category/${c.id}`} className="font-medium text-text hover:text-accent-2">
                      {c.label}
                    </Link>
                  </td>
                  <td className="tabular py-1.5">{c.open}</td>
                  <td className="tabular py-1.5 text-muted">{c.resolved}</td>
                  <td className="tabular py-1.5">{money(c.volume, { compact: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="עדכוני תוכן אחרונים" hint="כל ריצה של רוטינת העדכון, של ה-cron ושל לוח הניהול.">
          {s.recentRuns.length ? (
            <ul className="divide-y divide-border text-sm">
              {s.recentRuns.map((r) => (
                <li key={r.id} className="py-2">
                  <div className="flex items-center gap-2 text-[11px] text-muted-2">
                    <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-semibold text-muted">{r.source}</span>
                    <span>{timeAgo(r.createdAt)}</span>
                    <span className="tabular">+{r.added} נוספו · {r.updated} עודכנו · {r.resolved} הוכרעו</span>
                    {!r.ok && <span className="font-semibold text-no">נכשל</span>}
                  </div>
                  <p className="mt-0.5 text-[13px] text-text">{r.summary}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-muted">עדיין אין ריצות רשומות.</p>
          )}
        </Panel>

        <Panel title="מספרים נוספים">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Row label="שווקים בסך הכול" value={String(s.markets.total)} />
            <Row label="נוספו השבוע" value={String(s.markets.added7d)} />
            <Row label="מקודמים (featured)" value={String(s.markets.featured)} />
            <Row label="עסקאות ״כן״" value={pct(s.trading.yesShare)} />
            <Row label="מחזור השבוע" value={money(s.trading.volume7d, { compact: true })} />
            <Row label="עסקאות השבוע" value={String(s.trading.trades7d)} />
            <Row label="תגובות" value={`${s.engagement.comments} (${s.engagement.comments7d} השבוע)`} />
            <Row label="נקודות מחיר בהיסטוריה" value={String(s.engagement.pricePoints)} />
            <Row label="יתרות בארנקים" value={money(s.users.balance, { compact: true })} />
            <Row label="הודעות שהתקבלו" value={`${s.inbox.messagesTotal} (${s.inbox.messages7d} השבוע)`} />
            <Row label="הצעות שאלה" value={`${s.inbox.suggestionsTotal} (${s.inbox.suggestionsApproved} אושרו)`} />
            <Row label="מקורות השאלות" value={s.markets.byCreator.map((c) => `${c.source}: ${c.n}`).join(" · ") || "—"} />
          </dl>
        </Panel>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="tabular text-left font-semibold text-text-strong">{value}</dd>
    </>
  );
}
