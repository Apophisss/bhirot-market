"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { holdingValue, maxBuyAmount, PRICE_BAND, quoteBuy, quoteSell, type MarketState, type Side } from "@/lib/lmsr";
import { otherSide, sellPrefill, sellSide, sharesOn } from "@/lib/sell";
import { MAX_BET } from "@/lib/limits";
import { money, pct, shares as fmtShares, sharePrice, signedMoney } from "@/lib/format";
import { track } from "@/lib/track";
import { EVENTS } from "@/lib/events";
import { gaEvent } from "@/lib/gtag";
import { checkAdConversions } from "@/components/AdConversions";

export interface TradePanelProps {
  market: { id: string; qYes: number; qNo: number; liquidity: number; probability: number; isTradable: boolean; status: string; resolution: string | null };
  position: { yesShares: number; noShares: number; yesCost: number; noCost: number } | null;
  balance: number | null;
  loggedIn: boolean;
  initialSide?: Side;
  /** the portfolio links straight to "מכירה", so the sale can be checked against the value it showed */
  initialAction?: Action;
  /**
   * The amount the visitor had already typed before being sent to Google, carried
   * back on the URL. Without it, signing in from the middle of a trade returned an
   * empty form and the decision had to be made twice.
   */
  initialAmount?: string;
}

type Action = "BUY" | "SELL";

/** why there is a ceiling at all — a bare number reads as an arbitrary restriction */
const CAP_REASON = `עד ${MAX_BET} ₪ וירטואליים לעסקה, כדי שעסקה בודדת לא תזיז את המחיר ותשאיר אותו הוגן לכולם`;

export function TradePanel({
  market,
  position,
  balance,
  loggedIn,
  initialSide = "YES",
  initialAction = "BUY",
  initialAmount,
}: TradePanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [action, setAction] = useState<Action>(initialAction);
  // a sale can only ever be about a side that is held, so the sell tab never opens
  // on an empty one — see the note in src/lib/sell.ts
  const [side, setSide] = useState<Side>(() => (initialAction === "SELL" ? sellSide(position, initialSide) : initialSide));
  // arriving on the sell tab from the portfolio means "I want to sell this holding":
  // pre-filling the whole position makes the panel quote exactly the value the
  // portfolio just showed, instead of an empty form and a dash.
  const [input, setInput] = useState<string>(() =>
    initialAction === "SELL" ? sellPrefill(position, sellSide(position, initialSide)) : initialAmount ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  /** the panel's own confirm button — the sticky bar below only appears once it is off screen */
  const confirmRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [confirmOffScreen, setConfirmOffScreen] = useState(false);

  /** Moves the panel onto one side, carrying the sell box with it. */
  function pickSide(next: Side, forAction: Action = action) {
    setSide(next);
    if (forAction === "SELL") setInput(sellPrefill(position, next));
  }

  // the sticky mobile bar (see StickyTradeBar) picks a side and scrolls the panel into view
  useEffect(() => {
    const onPick = (e: Event) => {
      const picked = (e as CustomEvent<Side>).detail;
      if (picked === "YES" || picked === "NO") {
        setSide(picked);
        setAction("BUY");
        // the box means ₪ on the buy tab and shares on the sell tab — a leftover
        // share count must not be re-read as an amount to spend
        setInput("");
      }
    };
    window.addEventListener("market:pick-side", onPick);
    return () => window.removeEventListener("market:pick-side", onPick);
  }, []);

  // the sticky confirm bar exists only while the real button is out of sight
  useEffect(() => {
    const el = confirmRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setConfirmOffScreen(!entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const state: MarketState = { qYes: market.qYes, qNo: market.qNo, b: market.liquidity };

  const held = sharesOn(position, side);
  const heldCost = side === "YES" ? position?.yesCost ?? 0 : position?.noCost ?? 0;
  const flip = otherSide(side);
  const heldOther = sharesOn(position, flip);
  const qty = Number(input) || 0;

  // buying is capped at the 99% band so the user sees the limit instead of a
  // rejected trade. Selling is capped by the position alone — a holding can
  // always be closed in full, whatever the price did (see PRICE_BAND in lmsr.ts).
  const buyCap = useMemo(
    () => Math.floor(maxBuyAmount(state, side) * 100) / 100,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [side, market.qYes, market.qNo, market.liquidity],
  );
  const sellCap = held;
  // a single bet is capped at ₪MAX_BET site-wide; the market band and the user's
  // balance can only lower that, never raise it
  const buyLimit = Math.min(MAX_BET, buyCap, balance ?? Infinity);
  const limit = action === "BUY" ? buyLimit : sellCap;
  const overLimit = qty > limit + 1e-6;
  const buyBlocked = action === "BUY" && buyCap <= 0;
  const buyLimitNote =
    MAX_BET <= Math.min(buyCap, balance ?? Infinity)
      ? `אפשר להמר עד ${money(MAX_BET)} בעסקה אחת`
      : buyCap <= (balance ?? Infinity)
        ? `הסכום המרבי לעסקה כרגע הוא ${money(buyLimit)} — מעבר לזה השוק יחצה את ${Math.round(PRICE_BAND.max * 100)}%`
        : `היתרה שלך מאפשרת עד ${money(buyLimit)}`;

  const quote = useMemo(() => {
    if (qty <= 0) return null;
    const capped = Math.min(qty, action === "BUY" ? buyLimit : sellCap);
    if (capped <= 0) return null;
    if (action === "BUY") return quoteBuy(state, side, capped);
    return quoteSell(state, side, capped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, side, qty, market.qYes, market.qNo, market.liquidity, buyLimit, sellCap]);

  const sidePrice = side === "YES" ? market.probability : 1 - market.probability;

  // what the holding is worth is what selling it would pay — the same figure the
  // portfolio marks it at, and the one the "תקבל/י" row above quotes. Never
  // shares × price: that is the marginal price, and it overstates the position
  // (see the valuation note in lmsr.ts).
  const worth = useMemo(
    () => holdingValue(state, position?.yesShares ?? 0, position?.noShares ?? 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [position?.yesShares, position?.noShares, market.qYes, market.qNo, market.liquidity],
  );

  const confirmDisabled =
    busy ||
    (loggedIn &&
      (!quote || qty <= 0 || overLimit || limit <= 0 || (action === "SELL" && held <= 0) || (action === "BUY" && balance != null && qty > balance)));
  const showConfirmBar = market.isTradable && confirmOffScreen && qty > 0 && !confirmDisabled;

  /*
    The market page renders this panel twice — once in the phone column, once in the
    desktop aside — and only one of the two is ever laid out. The hidden copy has no
    box at all, so its confirm button reads as "off screen" forever; letting it
    announce a bar would hide the buy/sell bar on a page that is showing neither.
    `offsetParent` is null exactly for the copy inside `display:none`, so only the
    live panel speaks. StickyTradeBar listens and steps aside.
  */
  useEffect(() => {
    if (!rootRef.current?.offsetParent) return;
    window.dispatchEvent(new CustomEvent("market:confirm-bar", { detail: showConfirmBar }));
    return () => {
      window.dispatchEvent(new CustomEvent("market:confirm-bar", { detail: false }));
    };
  }, [showConfirmBar]);

  async function submit() {
    track(EVENTS.tradeAttempt, {
      marketId: market.id,
      value: qty,
      props: { side, action, loggedIn: loggedIn ? 1 : 0 },
    });
    if (!loggedIn) {
      // the decision travels with the visitor: the market page reads `side` and
      // `amount` back off the URL and hands them to this panel, so signing in
      // returns to the form as it was rather than to an empty one
      const back = new URLSearchParams({ side: side.toLowerCase() });
      if (qty > 0) back.set("amount", String(qty));
      router.push(`/login?callbackUrl=${encodeURIComponent(`${pathname}?${back}#trade`)}`);
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
        gaEvent("trade", {
          market_id: market.id,
          side,
          trade_action: action,
          // virtual shekels, reported as a plain number — see gaEvent()
          amount: Math.round(data.quote.amount * 100) / 100,
        });
        checkAdConversions();
        setMsg({
          kind: "ok",
          text:
            action === "BUY"
              ? `קנית ${fmtShares(data.quote.shares)} מניות ${side === "YES" ? "כן" : "לא"} ב־${money(data.quote.amount, { decimals: true })}`
              : `מכרת ${fmtShares(data.quote.shares)} מניות תמורת ${money(data.quote.amount, { decimals: true })}`,
        });
        // A sale used to leave "מניות למכירה (יש לך 61.6)" and the whole position box
        // standing after the shares were gone, because the box is filled from the
        // *prefill* the panel started with and `router.refresh()` only replaces the
        // server props. Buying looked fine by luck: it clears to an empty amount
        // field either way. So the panel is put back into the state the trade
        // produced before the refresh lands, rather than waiting for the refresh to
        // do it — and a sale that closed the position drops back to the buy tab,
        // which is the only thing left to do in a market you no longer hold.
        const soldAll = action === "SELL" && Math.min(qty, held) >= held - 1e-4;
        setInput("");
        if (soldAll) {
          const stillHeld = sharesOn(position, flip) > 0;
          if (!stillHeld) setAction("BUY");
          else pickSide(flip, "SELL");
        }
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
            התוצאה: {market.resolution === "YES" ? "כן" : "לא"}
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

  // buy shortcuts add to the amount, so they stay inside the ₪MAX_BET cap
  const quick = action === "BUY" ? [10, 25, 50, MAX_BET] : [0.25, 0.5, 0.75, 1];

  // the confirm button's own label, reused by the sticky bar below so the two can
  // never drift apart
  const confirmLabel = !loggedIn
    ? "התחברות כדי לסחור"
    : busy
      ? "מבצע…"
      : action === "BUY"
        ? `קנייה: ${side === "YES" ? "כן" : "לא"}`
        : `מכירה: ${side === "YES" ? "כן" : "לא"}`;
  const confirmTone = !loggedIn ? "bg-accent hover:bg-accent-2" : side === "YES" ? "bg-yes hover:bg-yes-2" : "bg-no hover:bg-no-2";
  // what the button is about to do, in one line: side, money, shares
  const confirmSummary = quote
    ? action === "BUY"
      ? `${money(Math.min(qty, buyLimit))} · ${fmtShares(quote.shares)} מניות`
      : `${fmtShares(Math.min(qty, held))} מניות · ${money(quote.amount, { decimals: true })}`
    : null;

  return (
    <div ref={rootRef} className="card p-4 sm:p-5">
      <div className="mb-4 flex gap-1 rounded-lg bg-surface-2 p-1">
        {(["BUY", "SELL"] as Action[]).map((a) => (
          <button
            key={a}
            onClick={() => {
              // "מכירה" lands on a side that is actually held: the selector is shared
              // with "קנייה", where כן is a fine default and here it is not.
              setAction(a);
              pickSide(a === "SELL" ? sellSide(position, side) : side, a);
              if (a === "BUY") setInput("");
              setMsg(null);
            }}
            className={`tap pressable flex-1 rounded-md text-sm font-bold transition ${action === a ? "bg-surface text-accent shadow-sm" : "text-muted hover:text-text"}`}
          >
            {a === "BUY" ? "קנייה" : "מכירה"}
          </button>
        ))}
      </div>

      {/* in "מכירה" each button also says what is held on that side, so the choice
          is not a guess: a sale is about a holding, not about a price */}
      <div className="grid grid-cols-2 gap-2">
        {(["YES", "NO"] as Side[]).map((s) => {
          const on = side === s;
          const heldHere = sharesOn(position, s);
          return (
            <button
              key={s}
              onClick={() => pickSide(s)}
              className={`pressable rounded-xl border-2 py-3 text-center font-extrabold transition ${
                s === "YES"
                  ? on
                    ? "border-yes bg-yes text-white"
                    : "border-border bg-surface-2 text-yes hover:border-yes/60"
                  : on
                    ? "border-no bg-no text-white"
                    : "border-border bg-surface-2 text-no hover:border-no/60"
              }`}
            >
              {s === "YES" ? "כן" : "לא"}{" "}
              <span className="tabular text-sm font-semibold opacity-90">{sharePrice(s === "YES" ? market.probability : 1 - market.probability)}</span>
              {action === "SELL" && (
                <span className="tabular block text-[11px] font-semibold opacity-80">
                  {heldHere > 0 ? `${fmtShares(heldHere)} מניות` : "אין מניות"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          <span title={action === "BUY" ? CAP_REASON : undefined}>
            {action === "BUY" ? `סכום (₪ וירטואלי · עד ${money(MAX_BET)} לעסקה)` : `מניות למכירה (יש לך ${fmtShares(held)})`}
          </span>
          {balance != null && action === "BUY" && <span className="tabular">יתרה: {money(balance)}</span>}
        </div>
        {buyBlocked ? (
          <p className="mb-1 rounded-md bg-warn/10 px-2 py-1 text-xs text-warn">
            הצד הזה הגיע לתקרה ({Math.round(PRICE_BAND.max * 100)}%) ואי אפשר לקנות עוד. מכירה של פוזיציה קיימת עדיין אפשרית.
          </p>
        ) : action === "SELL" && held <= 0 ? (
          // never leave a disabled sell button unexplained: a holder who lands on the
          // wrong side has to be told which side their position is on, and get there
          // in one click
          <p className="mb-1 rounded-md bg-warn/10 px-2 py-1 text-xs text-warn">
            {heldOther > 0 ? (
              <>
                אין לך מניות {side === "YES" ? "כן" : "לא"} בשוק הזה. הפוזיציה שלך היא {fmtShares(heldOther)} מניות{" "}
                {flip === "YES" ? "כן" : "לא"} —{" "}
                <button onClick={() => pickSide(flip)} className="font-bold underline hover:text-text-strong">
                  למכירה שלהן
                </button>
              </>
            ) : (
              "אין לך פוזיציה בשוק הזה, אז אין מה למכור. אפשר לקנות בלשונית ״קנייה״."
            )}
          </p>
        ) : (
          overLimit && (
            <p className="mb-1 rounded-md bg-warn/10 px-2 py-1 text-xs text-warn">
              {action === "BUY" ? buyLimitNote : `יש לך ${fmtShares(limit)} מניות למכירה`}
            </p>
          )
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
                // truncate, never round up: a value above `held` would trip overLimit.
                // "100%" leaves at most 0.0001 shares, which the engine writes off.
                else setInput(String(Math.floor(held * q * 1e4) / 1e4));
              }}
              className="tap pressable flex-1 rounded-lg border border-border bg-surface-2 text-xs font-semibold text-muted hover:border-border-2 hover:text-text-strong"
            >
              {action === "BUY" ? `+${q}` : `${Math.round(q * 100)}%`}
            </button>
          ))}
          {action === "BUY" && balance != null && (
            <button
              onClick={() => setInput(String(Math.floor(limit)))}
              className="tap pressable flex-1 rounded-lg border border-border bg-surface-2 text-xs font-semibold text-muted hover:border-border-2 hover:text-text-strong"
            >
              מקס
            </button>
          )}
        </div>
      </div>

      <dl className="mt-4 space-y-1.5 text-sm">
        {action === "BUY" ? (
          <>
            <Row label="מחיר ממוצע למניה" value={quote ? sharePrice(quote.avgPrice) : sharePrice(sidePrice)} />
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
            <Row label="מחיר ממוצע במכירה" value={quote ? sharePrice(quote.avgPrice) : sharePrice(sidePrice)} />
            <Row label="תקבל/י" value={quote ? money(quote.amount, { decimals: true }) : "—"} strong />
            <Row
              label="רווח/הפסד על החלק הנמכר"
              value={quote && held > 0 ? signedMoney(quote.amount - heldCost * (Math.min(qty, held) / held)) : "—"}
              muted
            />
          </>
        )}
      </dl>

      <button
        ref={confirmRef}
        onClick={submit}
        disabled={confirmDisabled}
        className={`pressable mt-4 w-full rounded-xl py-3.5 text-lg font-extrabold text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${confirmTone}`}
      >
        {confirmLabel}
        {confirmSummary && <span className="tabular ms-2 text-sm font-bold opacity-90">{confirmSummary}</span>}
      </button>

      {/*
        On a 812px-tall phone the confirm button sat at 1,043px — the decision was
        made two screens above the button that acts on it, and the fixed tab bar
        covered the bottom 61px on top of that. Once an amount is in and the real
        button has scrolled away, the same button follows to the bottom of the
        screen with the trade written on it. `pb-safe` keeps it off the home
        indicator, and it sits above the tab bar rather than under it.
      */}
      {showConfirmBar && (
        <div className="bottom-nav px-safe slide-up fixed inset-x-0 z-40 border-t border-border bg-bg/95 py-2 backdrop-blur lg:hidden">
          <div className="mx-auto max-w-lg px-3">
            <button
              onClick={submit}
              disabled={confirmDisabled}
              className={`pressable flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base font-extrabold text-white transition disabled:opacity-40 ${confirmTone}`}
            >
              {confirmLabel}
              {confirmSummary && <span className="tabular text-sm font-bold opacity-90">· {confirmSummary}</span>}
            </button>
          </div>
        </div>
      )}

      {/* the trade confirmation is injected, not navigated to — without a live region
          a screen reader is never told the trade went through */}
      <div role="status" aria-live="polite" aria-atomic="true">
        {msg && (
          <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-yes/10 text-yes" : "bg-no/10 text-no"}`}>{msg.text}</p>
        )}
      </div>

      {position && (position.yesShares > 0 || position.noShares > 0) && (
        <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted">
          <div className="mb-1 font-semibold text-text" title="השווי הוא מה שתקבלו בפועל אם תמכרו את הפוזיציה עכשיו, אחרי ההשפעה של המכירה עצמה על המחיר">
            הפוזיציה שלך
          </div>
          {position.yesShares > 0 && (
            <div className="flex justify-between">
              <span className="text-yes">כן · {fmtShares(position.yesShares)} מניות</span>
              <span className="tabular">שווי במכירה {money(worth.yes)} · עלות {money(position.yesCost)}</span>
            </div>
          )}
          {position.noShares > 0 && (
            <div className="flex justify-between">
              <span className="text-no">לא · {fmtShares(position.noShares)} מניות</span>
              <span className="tabular">שווי במכירה {money(worth.no)} · עלות {money(position.noCost)}</span>
            </div>
          )}
        </div>
      )}

      {!loggedIn && (
        <p className="mt-3 text-center text-xs text-muted-2">
          <Link href="/login" className="inline-flex min-h-11 items-center text-accent-2 hover:underline">התחברו עם Google</Link> וקבלו ₪10,000 וירטואליים למסחר
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
