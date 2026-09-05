"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { holdingValue, maxBuyAmount, PRICE_BAND, quoteBuy, quoteSell, type MarketState, type Side } from "@/lib/lmsr";
import { otherSide, sellPrefill, sellSide, sharesOn } from "@/lib/sell";
import { MAX_BET } from "@/lib/limits";
import { money, pct, shares as fmtShares, units, sharePrice, signedMoney, POINTS_SHORT, UNITS_LABEL } from "@/lib/format";
import { track } from "@/lib/track";
import { EVENTS } from "@/lib/events";
import { gaEvent } from "@/lib/gtag";
import { checkAdConversions } from "@/components/AdConversions";
import { ShareButton } from "./ShareButton";

export interface TradePanelProps {
  market: { id: string; qYes: number; qNo: number; liquidity: number; probability: number; isTradable: boolean; status: string; resolution: string | null };
  position: { yesShares: number; noShares: number; yesCost: number; noCost: number } | null;
  balance: number | null;
  loggedIn: boolean;
  /** the question itself, so a trade can be shared straight from the confirmation */
  marketTitle?: string;
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

/**
 * How much of the bottom of the screen the fixed tab bar (and the home indicator
 * under it) covers.
 *
 * Without it the sticky confirm bar never appeared where it was most needed. A
 * plain observer calls a button "visible" the moment one pixel of it is inside
 * the viewport — including the 61px strip the tab bar is painted over — so on a
 * 375x812 phone the confirm button sat at 1,285px, half of it behind the tab bar,
 * counted as on screen, and no bar came to fetch it. The root is shrunk by this
 * much and full visibility is required, so "reachable" means what it says.
 */
const NAV_CLEARANCE = 76;

/** why there is a ceiling at all — a bare number reads as an arbitrary restriction */
const CAP_REASON = `עד ${MAX_BET} נקודות לתשובה, כדי שתשובה בודדת לא תזיז את המד ותשאיר אותו הוגן לכולם`;

export function TradePanel({
  market,
  position,
  balance,
  loggedIn,
  marketTitle,
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
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string; shareSide?: Side } | null>(null);
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
        // the box means points on the answer tab and answers held on the return tab — a leftover
        // share count must not be re-read as an amount to spend
        setInput("");
      }
    };
    window.addEventListener("market:pick-side", onPick);
    return () => window.removeEventListener("market:pick-side", onPick);
  }, []);

  // the sticky confirm bar exists while any part of the real button is out of reach
  useEffect(() => {
    const el = confirmRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // `isIntersecting` is true at a single visible pixel whatever the threshold, so
    // the ratio is what is read here: anything short of the whole button, clear of
    // the tab bar, means the decision cannot be confirmed without scrolling.
    const io = new IntersectionObserver(([entry]) => setConfirmOffScreen(entry.intersectionRatio < 0.999), {
      rootMargin: `0px 0px -${NAV_CLEARANCE}px 0px`,
      threshold: [0, 1],
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const state: MarketState = { qYes: market.qYes, qNo: market.qNo, b: market.liquidity };

  const held = sharesOn(position, side);
  const heldCost = side === "YES" ? position?.yesCost ?? 0 : position?.noCost ?? 0;
  const flip = otherSide(side);
  const heldOther = sharesOn(position, flip);
  const qty = Number(input) || 0;

  /*
    Mirror the chosen side and amount into the URL.

    The panel's own login button can build its `callbackUrl` from state, but the
    blue "התחברות" in the header cannot see this component at all — and that is the
    button a visitor who is not yet signed in actually reaches for. Putting the
    decision on the URL is what lets every login link on the page carry it: the
    market page reads `side` and `amount` straight back off the query.

    `history.replaceState` rather than `router.replace`: this is a client-side
    annotation of where the user is, not a navigation. Next keeps `useSearchParams`
    in sync with it (which is how LoginLink notices), and no server render is
    triggered — a round trip per keystroke would be absurd.
  */
  useEffect(() => {
    if (loggedIn || action !== "BUY" || typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      params.set("side", side.toLowerCase());
      if (qty > 0) params.set("amount", String(qty));
      else params.delete("amount");
      window.history.replaceState(null, "", `${window.location.pathname}?${params}${window.location.hash}`);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loggedIn, action, side, qty]);


  // buying is capped at the 99% band so the user sees the limit instead of a
  // rejected trade. Selling is capped by the position alone — a holding can
  // always be closed in full, whatever the price did (see PRICE_BAND in lmsr.ts).
  const buyCap = useMemo(
    () => Math.floor(maxBuyAmount(state, side) * 100) / 100,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [side, market.qYes, market.qNo, market.liquidity],
  );
  const sellCap = held;
  // a single answer is capped at MAX_BET points site-wide; the price band and the user's
  // balance can only lower that, never raise it
  const buyLimit = Math.min(MAX_BET, buyCap, balance ?? Infinity);
  const limit = action === "BUY" ? buyLimit : sellCap;
  const overLimit = qty > limit + 1e-6;
  const buyBlocked = action === "BUY" && buyCap <= 0;
  const buyLimitNote =
    MAX_BET <= Math.min(buyCap, balance ?? Infinity)
      ? `אפשר לשים עד ${money(MAX_BET)} על תשובה אחת`
      : buyCap <= (balance ?? Infinity)
        ? `המרב לתשובה כרגע הוא ${money(buyLimit)} — מעבר לזה המד יחצה את ${Math.round(PRICE_BAND.max * 100)}%`
        : `הניקוד שלך מאפשר עד ${money(buyLimit)}`;

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
              ? `ענית ${side === "YES" ? "כן" : "לא"} ב־${money(data.quote.amount)} · ${money(data.quote.payout)} אם צדקת`
              : `החזרת ${units(data.quote.shares)} תמורת ${money(data.quote.amount)}`,
          // a prediction is worth sharing the moment it is made, and not after
          shareSide: action === "BUY" ? side : undefined,
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
        <h3 className="mb-2 font-bold text-text-strong">השאלה סגורה</h3>
        {market.status === "resolved" ? (
          <p className={`rounded-lg p-3 text-center text-lg font-extrabold ${market.resolution === "YES" ? "bg-yes/15 text-yes" : "bg-no/15 text-no"}`}>
            התוצאה: {market.resolution === "YES" ? "כן" : "לא"}
          </p>
        ) : market.status === "cancelled" ? (
          <p className="rounded-lg bg-surface-2 p-3 text-center font-bold text-muted">השאלה בוטלה והנקודות הוחזרו</p>
        ) : (
          <p className="text-sm text-muted">מועד הסגירה עבר. השאלה ממתינה להכרעה על ידי צוות המערכת לפי קריטריוני ההכרעה.</p>
        )}
        {position && (position.yesShares > 0 || position.noShares > 0) && (
          <div className="mt-3 text-sm text-muted">
            האחיזה שלך: {position.yesShares > 0 && <span className="text-yes">{units(position.yesShares)} כן</span>}
            {position.yesShares > 0 && position.noShares > 0 && " · "}
            {position.noShares > 0 && <span className="text-no">{units(position.noShares)} לא</span>}
          </div>
        )}
      </div>
    );
  }

  // the shortcuts add to the amount, so they stay inside the MAX_BET cap
  const quick = action === "BUY" ? [10, 25, 50, MAX_BET] : [0.25, 0.5, 0.75, 1];

  // the confirm button's own label, reused by the sticky bar below so the two can
  // never drift apart
  const confirmLabel = !loggedIn
    ? "התחברות כדי לענות"
    : busy
      ? "מבצע…"
      : action === "BUY"
        ? `תשובה: ${side === "YES" ? "כן" : "לא"}`
        : `החזרה: ${side === "YES" ? "כן" : "לא"}`;
  const confirmTone = !loggedIn ? "bg-accent hover:bg-accent-2" : side === "YES" ? "bg-yes hover:bg-yes-2" : "bg-no hover:bg-no-2";
  // What the button is about to do, in one line: what it costs and what it pays.
  // The share count that used to sit here IS the payout — a winning unit pays one
  // point — so the button said the same number twice, once under a name that made
  // a single answer read as "27.9 תשובות".
  const confirmSummary = quote
    ? action === "BUY"
      ? `${money(Math.min(qty, buyLimit))} ← ${money(quote.payout)} אם צדקת`
      : `${units(Math.min(qty, held))} · ${money(quote.amount)}`
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
            {a === "BUY" ? "תשובה" : "החזרה"}
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
              {/* the meter, in the site's own price language — a second unit ("0.21 נק׳")
                  on the same button said the same thing twice, in a language the rest of
                  the card does not speak */}
              <span className="tabular text-[15px] font-semibold opacity-90">{pct(s === "YES" ? market.probability : 1 - market.probability)}</span>
              {action === "SELL" && (
                <span className="tabular block text-[13px] font-semibold opacity-80">
                  {heldHere > 0 ? units(heldHere) : `אין ${UNITS_LABEL}`}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          <span title={action === "BUY" ? CAP_REASON : undefined}>
            {action === "BUY" ? `נקודות (עד ${money(MAX_BET)} לתשובה)` : `${UNITS_LABEL} להחזרה (יש לך ${fmtShares(held)})`}
          </span>
          {balance != null && action === "BUY" && <span className="tabular">ניקוד: {money(balance)}</span>}
        </div>
        {buyBlocked ? (
          <p className="mb-1 rounded-md bg-warn/10 px-2 py-1 text-xs text-warn">
            הצד הזה הגיע לתקרה ({Math.round(PRICE_BAND.max * 100)}%) ואי אפשר לענות עוד. החזרה של תשובות שכבר יש לכם עדיין אפשרית.
          </p>
        ) : action === "SELL" && held <= 0 ? (
          // never leave a disabled sell button unexplained: a holder who lands on the
          // wrong side has to be told which side their position is on, and get there
          // in one click
          <p className="mb-1 rounded-md bg-warn/10 px-2 py-1 text-xs text-warn">
            {heldOther > 0 ? (
              <>
                אין לך {UNITS_LABEL} של {side === "YES" ? "כן" : "לא"} בשאלה הזו. יש לך {units(heldOther)} של{" "}
                {flip === "YES" ? "כן" : "לא"} —{" "}
                <button onClick={() => pickSide(flip)} className="font-bold underline hover:text-text-strong">
                  להחזרה שלהן
                </button>
              </>
            ) : (
              "אין לך אחיזה בשאלה הזו, אז אין מה להחזיר. אפשר לענות בלשונית ״תשובה״."
            )}
          </p>
        ) : (
          overLimit && (
            <p className="mb-1 rounded-md bg-warn/10 px-2 py-1 text-xs text-warn">
              {action === "BUY" ? buyLimitNote : `יש לך ${units(limit)} להחזרה`}
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
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-sm text-muted">{action === "BUY" ? POINTS_SHORT : "#"}</span>
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

      {/*
        One line, and the mechanics behind a tap.

        These four rows (average price, units received, the meter afterwards, the
        payout) pushed the confirm button from 1,043px to 1,285px on an 812px
        phone — the panel grew by exactly the height of the explanation, and the
        thing being explained went off the bottom of the screen. Only one of the
        four is the decision: what this costs and what it pays. The rest is how
        the market maker got there, and it is one tap away for anyone who wants it.
      */}
      <details className="group mt-3 rounded-xl border border-border bg-surface-2 px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-[15px] marker:content-none">
          <span className="text-muted">
            {action === "BUY" ? "תשלום אם צדקת" : "תקבל/י"}
            <span className="ms-1.5 text-[13px] text-muted-2">
              פירוט <span className="inline-block transition group-open:rotate-180">▾</span>
            </span>
          </span>
          <span className="tabular font-extrabold text-yes">
            {action === "BUY"
              ? quote
                ? money(quote.payout)
                : "—"
              : quote
                ? money(quote.amount)
                : "—"}
            {action === "BUY" && quote && qty > 0 && (
              <span className="ms-1 text-[13px] font-normal text-muted">({((quote.payout / qty - 1) * 100).toFixed(0)}%+)</span>
            )}
          </span>
        </summary>
        <dl className="mt-2 space-y-1.5 border-t border-border pt-2 text-[13px]">
          {action === "BUY" ? (
            <>
              <Row label="מחיר ממוצע ליחידה" value={quote ? sharePrice(quote.avgPrice) : sharePrice(sidePrice)} />
              <Row label={`${UNITS_LABEL} שתקבל/י`} value={quote ? fmtShares(quote.shares) : "—"} />
              <Row label="המד אחרי התשובה" value={quote ? pct(quote.priceAfter, 1) : pct(sidePrice, 1)} muted />
            </>
          ) : (
            <>
              <Row label="מחיר ממוצע בהחזרה" value={quote ? sharePrice(quote.avgPrice) : sharePrice(sidePrice)} />
              <Row
                label="רווח/הפסד על החלק שהוחזר"
                value={quote && held > 0 ? signedMoney(quote.amount - heldCost * (Math.min(qty, held) / held)) : "—"}
                muted
              />
            </>
          )}
        </dl>
      </details>

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
          <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-yes/10 text-yes" : "bg-no/10 text-no"}`}>
            <p>{msg.text}</p>
            {msg.shareSide && marketTitle && (
              <ShareButton
                title={marketTitle}
                path={pathname}
                text={`ניחשתי ${msg.shareSide === "YES" ? "כן" : "לא"} · ${marketTitle}`}
                label="שתפו את הניחוש"
                className="mt-2 bg-surface"
              />
            )}
          </div>
        )}
      </div>

      {position && (position.yesShares > 0 || position.noShares > 0) && (
        <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted">
          <div className="mb-1 font-semibold text-text" title="השווי הוא מה שתקבלו בפועל אם תחזירו את התשובות עכשיו, אחרי ההשפעה של ההחזרה עצמה על המד">
            התשובות שלך
          </div>
          {position.yesShares > 0 && (
            <div className="flex justify-between">
              <span className="text-yes">כן · {units(position.yesShares)}</span>
              <span className="tabular">שווי בהחזרה {money(worth.yes)} · עלות {money(position.yesCost)}</span>
            </div>
          )}
          {position.noShares > 0 && (
            <div className="flex justify-between">
              <span className="text-no">לא · {units(position.noShares)}</span>
              <span className="tabular">שווי בהחזרה {money(worth.no)} · עלות {money(position.noCost)}</span>
            </div>
          )}
        </div>
      )}

      {!loggedIn && (
        <p className="mt-3 text-center text-xs text-muted-2">
          <Link href="/login" className="inline-flex min-h-11 items-center text-accent-2 hover:underline">התחברו עם Google</Link> וקבלו 10,000 נקודות למשחק
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
