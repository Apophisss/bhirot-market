"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { maxBuyAmount, maxSellShares, PRICE_BAND, quoteBuy, quoteSell, type MarketState, type Side } from "@/lib/lmsr";
import { money, pct, shares as fmtShares, agora } from "@/lib/format";

export interface TradePanelProps {
  market: { id: string; qYes: number; qNo: number; liquidity: number; probability: number; isTradable: boolean; status: string; resolution: string | null };
  position: { yesShares: number; noShares: number; yesCost: number; noCost: number } | null;
  balance: number | null;
  loggedIn: boolean;
  initialSide?: Side;
}

type Action = "BUY" | "SELL";

export function TradePanel({ market, position, balance, loggedIn, initialSide = "YES" }: TradePanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [action, setAction] = useState<Action>("BUY");
  const [side, setSide] = useState<Side>(initialSide);
  const [input, setInput] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // the sticky mobile bar (see StickyTradeBar) picks a side and scrolls the panel into view
  useEffect(() => {
    const onPick = (e: Event) => {
      const picked = (e as CustomEvent<Side>).detail;
      if (picked === "YES" || picked === "NO") {
        setSide(picked);
        setAction("BUY");
      }
    };
    window.addEventListener("market:pick-side", onPick);
    return () => window.removeEventListener("market:pick-side", onPick);
  }, []);

  const state: MarketState = { qYes: market.qYes, qNo: market.qNo, b: market.liquidity };
  const held = side === "YES" ? position?.yesShares ?? 0 : position?.noShares ?? 0;
  const heldCost = side === "YES" ? position?.yesCost ?? 0 : position?.noCost ?? 0;
  const qty = Number(input) || 0;

  // the market maker only trades inside a 1%-99% band; cap the order so the
  // user sees the limit instead of a rejected trade
  const buyCap = useMemo(
    () => Math.floor(maxBuyAmount(state, side) * 100) / 100,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [side, market.qYes, market.qNo, market.liquidity],
  );
  const sellCap = useMemo(
    () => Math.min(held, Math.floor(maxSellShares(state, side) * 100) / 100),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [side, held, market.qYes, market.qNo, market.liquidity],
  );
  const limit = action === "BUY" ? Math.min(buyCap, balance ?? buyCap) : sellCap;
  const overLimit = qty > limit + 1e-6;

  const quote = useMemo(() => {
    if (qty <= 0) return null;
    const capped = Math.min(qty, action === "BUY" ? buyCap : sellCap);
    if (capped <= 0) return null;
    if (action === "BUY") return quoteBuy(state, side, capped);
    return quoteSell(state, side, capped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, side, qty, market.qYes, market.qNo, market.liquidity, buyCap, sellCap]);

  const sidePrice = side === "YES" ? market.probability : 1 - market.probability;

  async function submit() {
    if (!loggedIn) {
      router.push(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!quote || qty <= 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ marketId: market.id, side, action, quantity: action === "SELL" ? Math.min(qty, held) : qty }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMsg({ kind: "err", text: data.error ?? "שגיאה" });
      } else {
        setMsg({
          kind: "ok",
          text:
            action === "BUY"
              ? `קנית ${fmtShares(data.quote.shares)} מניות ${side === "YES" ? "כן" : "לא"} ב־${money(data.quote.amount, { decimals: true })}`
              : `מכרת ${fmtShares(data.quote.shares)} מניות תמורת ${money(data.quote.amount, { decimals: true })}`,
        });
        setInput("");
        router.refresh();
      }
    } catch {
      setMsg({ kind: "err", text: "שגיאת רשת" });
    } finally {
      setBusy(false);
    }
  }

  if (!market.isTradable) {
    return (
      <div className="card p-4 sm:p-5">
        <h3 className="mb-2 font-bold text-text-strong">המסחר סגור</h3>
        {market.status === "resolved" ? (
          <p className={`rounded-lg p-3 text-center text-lg font-extrabold ${market.resolution === "YES" ? "bg-yes/15 text-yes" : "bg-no/15 text-no"}`}>
            התוצאה: {market.resolution === "YES" ? "כן ✓" : "לא ✗"}
          </p>
        ) : market.status === "cancelled" ? (
          <p className="rounded-lg bg-surface-2 p-3 text-center font-bold text-muted">השוק בוטל והכסף הוחזר</p>
        ) : (
          <p className="text-sm text-muted">מועד הסגירה עבר. השוק ממתין להכרעה על ידי צוות המערכת לפי קריטריוני ההכרעה.</p>
        )}
        {position && (position.yesShares > 0 || position.noShares > 0) && (
          <div className="mt-3 text-sm text-muted">
            הפוזיציה שלך: {position.yesShares > 0 && <span className="text-yes">{fmtShares(position.yesShares)} כן</span>}
            {position.yesShares > 0 && position.noShares > 0 && " · "}
            {position.noShares > 0 && <span className="text-no">{fmtShares(position.noShares)} לא</span>}
          </div>
        )}
      </div>
    );
  }

  const quick = action === "BUY" ? [10, 50, 100, 500] : [0.25, 0.5, 0.75, 1];

  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-4 flex gap-1 rounded-lg bg-surface-2 p-1">
        {(["BUY", "SELL"] as Action[]).map((a) => (
          <button
            key={a}
            onClick={() => {
              setAction(a);
              setInput("");
              setMsg(null);
            }}
            className={`pressable flex-1 rounded-md py-2 text-sm font-bold transition ${action === a ? "bg-surface text-accent shadow-sm" : "text-muted hover:text-text"}`}
          >
            {a === "BUY" ? "קנייה" : "מכירה"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setSide("YES")}
          className={`pressable rounded-xl border-2 py-3.5 text-center font-extrabold transition ${
            side === "YES" ? "border-yes bg-yes text-white" : "border-border bg-surface-2 text-yes hover:border-yes/60"
          }`}
        >
          כן <span className="tabular text-sm font-semibold opacity-90">{agora(market.probability)}</span>
        </button>
        <button
          onClick={() => setSide("NO")}
          className={`pressable rounded-xl border-2 py-3.5 text-center font-extrabold transition ${
            side === "NO" ? "border-no bg-no text-white" : "border-border bg-surface-2 text-no hover:border-no/60"
          }`}
        >
          לא <span className="tabular text-sm font-semibold opacity-90">{agora(1 - market.probability)}</span>
        </button>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          <span>{action === "BUY" ? "סכום (₪ וירטואלי)" : `מניות למכירה (יש לך ${fmtShares(held)})`}</span>
          {balance != null && action === "BUY" && <span className="tabular">יתרה: {money(balance)}</span>}
        </div>
        {overLimit && (
          <p className="mb-1 rounded-md bg-warn/10 px-2 py-1 text-xs text-warn">
            {action === "BUY"
              ? `הסכום המרבי לעסקה כרגע הוא ${money(limit)} — מעבר לזה השוק יחצה את ${Math.round(PRICE_BAND.max * 100)}%`
              : `אפשר למכור עד ${fmtShares(limit)} מניות — מעבר לזה השוק ירד מתחת ל-${Math.round(PRICE_BAND.min * 100)}%`}
          </p>
        )}
        <div className="relative">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="0"
            className="tabular w-full rounded-xl border border-border bg-surface-2 py-3.5 pe-3 ps-10 text-2xl font-bold outline-none focus:border-accent"
          />
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-lg text-muted">{action === "BUY" ? "₪" : "#"}</span>
        </div>
        <div className="mt-2 flex gap-2">
          {quick.map((q) => (
            <button
              key={q}
              onClick={() => {
                if (action === "BUY") setInput(String(Math.min((Number(input) || 0) + q, limit)));
                else setInput(Math.min(held * q, sellCap).toFixed(2));
              }}
              className="pressable min-h-9 flex-1 rounded-lg border border-border bg-surface-2 py-1.5 text-xs font-semibold text-muted hover:border-border-2 hover:text-text-strong"
            >
              {action === "BUY" ? `+${q}` : `${Math.round(q * 100)}%`}
            </button>
          ))}
          {action === "BUY" && balance != null && (
            <button
              onClick={() => setInput(String(Math.floor(limit)))}
              className="pressable min-h-9 flex-1 rounded-lg border border-border bg-surface-2 py-1.5 text-xs font-semibold text-muted hover:border-border-2 hover:text-text-strong"
            >
              מקס
            </button>
          )}
        </div>
      </div>

      <dl className="mt-4 space-y-1.5 text-sm">
        {action === "BUY" ? (
          <>
            <Row label="מחיר ממוצע למניה" value={quote ? agora(quote.avgPrice) : agora(sidePrice)} />
            <Row label="מניות שתקבל/י" value={quote ? fmtShares(quote.shares) : "—"} />
            <Row label="מחיר אחרי העסקה" value={quote ? pct(quote.priceAfter, 1) : pct(sidePrice, 1)} muted />
            <Row
              label="תשלום אם צדקת"
              value={quote ? `${money(quote.payout, { decimals: true })}` : "—"}
              hint={quote && qty > 0 ? `(${((quote.payout / qty - 1) * 100).toFixed(0)}%+)` : undefined}
              strong
            />
          </>
        ) : (
          <>
            <Row label="מחיר ממוצע במכירה" value={quote ? agora(quote.avgPrice) : agora(sidePrice)} />
            <Row label="תקבל/י" value={quote ? money(quote.amount, { decimals: true }) : "—"} strong />
            <Row
              label="רווח/הפסד על החלק הנמכר"
              value={quote && held > 0 ? money(quote.amount - heldCost * (Math.min(qty, held) / held), { decimals: true }) : "—"}
              muted
            />
          </>
        )}
      </dl>

      <button
        onClick={submit}
        disabled={
          busy ||
          (loggedIn &&
            (!quote || qty <= 0 || overLimit || limit <= 0 || (action === "SELL" && held <= 0) || (action === "BUY" && balance != null && qty > balance)))
        }
        className={`pressable mt-4 w-full rounded-xl py-3.5 text-lg font-extrabold text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${
          !loggedIn ? "bg-accent hover:bg-accent-2" : side === "YES" ? "bg-yes hover:bg-yes-2" : "bg-no hover:bg-no-2"
        }`}
      >
        {!loggedIn ? "התחברות כדי לסחור" : busy ? "מבצע…" : action === "BUY" ? `קנייה: ${side === "YES" ? "כן" : "לא"}` : `מכירה: ${side === "YES" ? "כן" : "לא"}`}
      </button>

      {msg && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-yes/10 text-yes" : "bg-no/10 text-no"}`}>{msg.text}</p>
      )}

      {position && (position.yesShares > 0 || position.noShares > 0) && (
        <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted">
          <div className="mb-1 font-semibold text-text">הפוזיציה שלך</div>
          {position.yesShares > 0 && (
            <div className="flex justify-between">
              <span className="text-yes">כן · {fmtShares(position.yesShares)} מניות</span>
              <span className="tabular">שווי {money(position.yesShares * market.probability)} · עלות {money(position.yesCost)}</span>
            </div>
          )}
          {position.noShares > 0 && (
            <div className="flex justify-between">
              <span className="text-no">לא · {fmtShares(position.noShares)} מניות</span>
              <span className="tabular">שווי {money(position.noShares * (1 - market.probability))} · עלות {money(position.noCost)}</span>
            </div>
          )}
        </div>
      )}

      {!loggedIn && (
        <p className="mt-3 text-center text-xs text-muted-2">
          <Link href="/login" className="text-accent-2 hover:underline">התחברו עם Google</Link> וקבלו ₪10,000 וירטואליים למסחר
        </p>
      )}
    </div>
  );
}

function Row({ label, value, hint, muted, strong }: { label: string; value: string; hint?: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? "text-muted-2" : "text-muted"}>{label}</dt>
      <dd className={`tabular ${strong ? "font-extrabold text-yes" : "font-semibold text-text"}`}>
        {value} {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
      </dd>
    </div>
  );
}
