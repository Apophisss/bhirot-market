"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { quoteBuy, type MarketState, type Side } from "@/lib/lmsr";
import { money, pct, agora, shares as fmtShares, closesLabel } from "@/lib/format";
import { SITE_TEAM } from "@/lib/config";
import {
  RAPID_DEFAULT_STAKE,
  RAPID_MAX_STAKE,
  RAPID_MIN_STAKE,
  RAPID_STAKE_PRESETS,
  RAPID_STAKE_STEP,
  clampStake,
  type RapidCard,
} from "@/lib/rapid";
import { MarketImage } from "./MarketImage";

type AnswerStatus = "pending" | "ok" | "error";

interface Answer {
  marketId: string;
  side: Side;
  stake: number;
  status: AnswerStatus;
  shares?: number;
  error?: string;
}

interface AnswerResult {
  ok?: boolean;
  balance?: number;
  shares?: number;
  error?: string;
  code?: string;
}

/** how long the answered card stays on screen before the feed scrolls on */
const ADVANCE_MS = 420;
/** horizontal drag distance (px) that commits an answer */
const DRAG_COMMIT = 96;

/* ------------------------------------------------- the stake, as a store --
 * The chosen stake survives reloads. Reading localStorage during render would
 * break hydration, so it is exposed as an external store: the server snapshot
 * is the default and the stored value arrives on the first client render.
 */

const STAKE_KEY = "bhirot:rapid:stake";
let stakeCache: number | null = null;
const stakeListeners = new Set<() => void>();

function readStake(): number {
  if (stakeCache == null) {
    try {
      const saved = window.localStorage.getItem(STAKE_KEY);
      stakeCache = saved ? clampStake(Number(saved)) : RAPID_DEFAULT_STAKE;
    } catch {
      stakeCache = RAPID_DEFAULT_STAKE;
    }
  }
  return stakeCache;
}

function writeStake(v: number) {
  stakeCache = clampStake(v);
  try {
    window.localStorage.setItem(STAKE_KEY, String(stakeCache));
  } catch {
    /* private mode — keep it in memory for this run */
  }
  for (const l of stakeListeners) l();
}

function subscribeStake(cb: () => void) {
  stakeListeners.add(cb);
  return () => {
    stakeListeners.delete(cb);
  };
}

function useStake() {
  return useSyncExternalStore(subscribeStake, readStake, () => RAPID_DEFAULT_STAKE);
}

function useMediaQuery(query: string, serverValue = false) {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );
  const snapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, snapshot, () => serverValue);
}

/* ------------------------------------------------------------------ deck -- */

export function RapidDeck({
  cards,
  loggedIn,
  balance,
  children,
}: {
  cards: RapidCard[];
  loggedIn: boolean;
  balance: number | null;
  /** shown instead of the deck when the feed came back empty */
  children: React.ReactNode;
}) {
  const router = useRouter();
  // The deck runs off a snapshot of the feed it was mounted with. Answering a
  // question removes it from the server-side feed, so refreshing at the end of a
  // run would otherwise pull every card — and the summary — out from under the
  // user. Changing a filter navigates with a new key, which remounts with fresh
  // cards; see the key on <RapidDeck> in app/rapid/page.tsx.
  const [feed] = useState(cards);
  const scroller = useRef<HTMLDivElement>(null);
  const queue = useRef<Answer[]>([]);
  const draining = useRef(false);
  const alive = useRef(true);
  /** index a programmatic scroll is heading to — scroll events are ignored until it lands */
  const target = useRef<number | null>(null);
  const targetTimer = useRef(0);
  const advanceTimer = useRef(0);

  const stake = useStake();
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const showKeys = useMediaQuery("(min-width: 1024px)");

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [liveBalance, setLiveBalance] = useState<number | null>(balance);
  const [halted, setHalted] = useState(false);

  useEffect(
    () => () => {
      alive.current = false;
      window.clearTimeout(targetTimer.current);
      window.clearTimeout(advanceTimer.current);
    },
    [],
  );

  const answered = useMemo(() => Object.values(answers), [answers]);
  const pendingCount = answered.filter((a) => a.status === "pending").length;
  /** money committed by answers the server has not confirmed yet */
  const pendingSpend = answered.reduce((s, a) => s + (a.status === "pending" ? a.stake : 0), 0);
  const available = liveBalance == null ? null : liveBalance - pendingSpend;
  const broke = halted || (available != null && available < stake);
  const outOfMoney = halted || (available != null && available < RAPID_MIN_STAKE);

  const okCount = answered.filter((a) => a.status !== "error").length;
  const failedCount = answered.filter((a) => a.status === "error").length;

  const goTo = useCallback(
    (i: number, delay = 0) => {
      const clamped = Math.max(0, Math.min(feed.length, i));
      setIndex(clamped);
      window.clearTimeout(advanceTimer.current);
      const run = () => {
        const el = scroller.current;
        if (!el) return;
        target.current = clamped;
        el.scrollTo({ top: clamped * el.clientHeight, behavior: reduceMotion ? "auto" : "smooth" });
        window.clearTimeout(targetTimer.current);
        targetTimer.current = window.setTimeout(() => {
          target.current = null;
        }, 900);
      };
      if (delay) advanceTimer.current = window.setTimeout(run, delay);
      else run();
    },
    [feed.length, reduceMotion],
  );

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      // strictly one request at a time: every answer debits the same balance row,
      // so parallel requests would race on the read-modify-write in executeTrade()
      while (queue.current.length) {
        const job = queue.current.shift()!;
        let patch: Answer;
        let data: AnswerResult | null = null;
        try {
          const res = await fetch("/api/rapid/answer", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ marketId: job.marketId, side: job.side, stake: job.stake }),
          });
          data = (await res.json().catch(() => null)) as AnswerResult | null;
          patch =
            res.ok && data?.ok
              ? { ...job, status: "ok", shares: data.shares }
              : { ...job, status: "error", error: data?.error ?? "לא הצלחנו לבצע את העסקה" };
        } catch {
          patch = { ...job, status: "error", error: "שגיאת רשת" };
        }
        if (!alive.current) return;
        if (patch.status === "ok" && typeof data?.balance === "number") setLiveBalance(data.balance);

        // out of money: every queued answer after this one would fail the same way,
        // so stop the run instead of firing a burst of doomed requests
        if (data?.code === "INSUFFICIENT_BALANCE") {
          const stranded = queue.current.splice(0);
          setHalted(true);
          setAnswers((prev) => {
            const next = { ...prev, [job.marketId]: patch };
            for (const s of stranded) next[s.marketId] = { ...s, status: "error", error: "נגמרה היתרה" };
            return next;
          });
          continue;
        }
        setAnswers((prev) => ({ ...prev, [job.marketId]: patch }));
      }
    } finally {
      draining.current = false;
    }
  }, []);

  const answer = useCallback(
    (card: RapidCard, side: Side) => {
      if (!loggedIn) {
        router.push("/login?callbackUrl=%2Frapid");
        return;
      }
      if (answers[card.id] || broke) return; // answered already, or nothing left to bet
      const job: Answer = { marketId: card.id, side, stake, status: "pending" };
      setAnswers((prev) => ({ ...prev, [card.id]: job }));
      queue.current.push(job);
      void drain();
      if (typeof navigator.vibrate === "function") navigator.vibrate(12);
      goTo(feed.indexOf(card) + 1, ADVANCE_MS);
    },
    [answers, broke, feed, drain, goTo, loggedIn, router, stake],
  );

  /* the active card follows the scroll position — every panel is exactly one viewport tall */
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (!el.clientHeight) return;
        const i = Math.round(el.scrollTop / el.clientHeight);
        if (target.current != null) {
          if (i !== target.current) return; // still travelling — ignore the halfway readings
          target.current = null;
        }
        setIndex(i);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  /* keyboard rapid-fire */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // a held-down key repeats ~30×/sec; without this it would answer the whole deck
      if (e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const card = feed[index];
      switch (e.key) {
        case "ArrowRight":
          if (!card) return;
          e.preventDefault();
          answer(card, "YES");
          break;
        case "ArrowLeft":
          if (!card) return;
          e.preventDefault();
          answer(card, "NO");
          break;
        case "ArrowDown":
        case " ":
          e.preventDefault();
          goTo(index + 1);
          break;
        case "ArrowUp":
          e.preventDefault();
          goTo(index - 1);
          break;
        case "+":
        case "=":
          e.preventDefault();
          writeStake(stake + RAPID_STAKE_STEP);
          break;
        case "-":
        case "_":
          e.preventDefault();
          writeStake(stake - RAPID_STAKE_STEP);
          break;
        default: {
          // 1…5 jump straight to a preset stake
          const preset = RAPID_STAKE_PRESETS[Number(e.key) - 1];
          if (preset != null) {
            e.preventDefault();
            writeStake(preset);
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, feed, goTo, index, stake]);

  /* answers are binding — never let the tab close on money still in flight */
  useEffect(() => {
    if (!pendingCount) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [pendingCount]);

  /* the run is over: refresh the server tree so the header balance catches up */
  const refreshed = useRef(false);
  useEffect(() => {
    if (refreshed.current || index < feed.length || !answered.length || pendingCount) return;
    refreshed.current = true;
    router.refresh();
  }, [answered.length, feed.length, index, pendingCount, router]);

  const atSummary = index >= feed.length;
  const totalStaked = answered.filter((a) => a.status !== "error").reduce((s, a) => s + a.stake, 0);
  const totalPayout = answered.filter((a) => a.status === "ok").reduce((s, a) => s + (a.shares ?? 0), 0);
  const yesCount = answered.filter((a) => a.side === "YES" && a.status !== "error").length;
  const firstError = answered.find((a) => a.status === "error")?.error;

  if (!feed.length) return <>{children}</>;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="tabular rounded-full border border-border bg-surface px-2.5 py-1 font-bold text-text-strong">
            {Math.min(index + 1, feed.length)} / {feed.length}
          </span>
          <span className="text-muted">
            נענו <strong className="tabular text-text">{okCount}</strong>
            {pendingCount > 0 && <span className="text-muted-2"> · {pendingCount} בדרך</span>}
            {failedCount > 0 && <span className="text-no"> · {failedCount} נכשלו</span>}
          </span>
        </div>
        {liveBalance != null && (
          <span
            className={`tabular rounded-full border border-border bg-surface px-2.5 py-1 font-semibold ${outOfMoney ? "text-no" : "text-yes"}`}
          >
            יתרה {money(Math.max(0, available ?? liveBalance))}
          </span>
        )}
      </header>

      <RunTape cards={feed} answers={answers} index={index} />

      <div
        ref={scroller}
        className="scrollbar-none min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain"
      >
        {feed.map((card, i) => (
          <div key={card.id} className="h-full snap-start snap-always pb-1">
            <RapidCardView
              card={card}
              stake={stake}
              answer={answers[card.id]}
              locked={broke && !answers[card.id]}
              outOfMoney={outOfMoney}
              loggedIn={loggedIn}
              reduceMotion={reduceMotion}
              showKeys={showKeys}
              onAnswer={(side) => answer(card, side)}
              onSkip={() => goTo(i + 1)}
            />
          </div>
        ))}
        <div className="h-full snap-start snap-always pb-1">
          <RunSummary
            done={okCount}
            failed={failedCount}
            firstError={firstError}
            total={feed.length}
            yesCount={yesCount}
            totalStaked={totalStaked}
            totalPayout={totalPayout}
            showActions={atSummary}
            onRestart={() => goTo(0)}
          />
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {atSummary ? "סוף הרצף" : `שאלה ${index + 1} מתוך ${feed.length}: ${feed[index]?.title ?? ""}`}
      </p>

      <StakeBar
        stake={stake}
        available={available}
        broke={broke}
        outOfMoney={outOfMoney}
        showKeys={showKeys}
        dimmed={atSummary}
      />
    </section>
  );
}

/* --------------------------------------------------------------- run tape -- */

/** Doubles as the progress bar: one segment per question, coloured by what you answered. */
function RunTape({
  cards,
  answers,
  index,
}: {
  cards: RapidCard[];
  answers: Record<string, Answer>;
  index: number;
}) {
  return (
    <div className="flex h-1.5 shrink-0 gap-px overflow-hidden rounded-full" aria-hidden>
      {cards.map((c, i) => {
        const a = answers[c.id];
        const tone = a
          ? a.status === "error"
            ? "bg-no/40"
            : a.status === "pending"
              ? "bg-muted-2"
              : a.side === "YES"
                ? "bg-yes"
                : "bg-no"
          : i === index
            ? "bg-accent"
            : "bg-surface-2";
        return <span key={c.id} className={`min-w-px flex-1 ${tone}`} />;
      })}
    </div>
  );
}

/* ------------------------------------------------------------- one card -- */

function RapidCardView({
  card,
  stake,
  answer,
  locked,
  outOfMoney,
  loggedIn,
  reduceMotion,
  showKeys,
  onAnswer,
  onSkip,
}: {
  card: RapidCard;
  stake: number;
  answer?: Answer;
  locked: boolean;
  outOfMoney: boolean;
  loggedIn: boolean;
  reduceMotion: boolean;
  showKeys: boolean;
  onAnswer: (side: Side) => void;
  onSkip: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x0: number; y0: number; axis: "?" | "x" | "y" } | null>(null);

  const state: MarketState = { qYes: card.qYes, qNo: card.qNo, b: card.liquidity };
  const payouts = useMemo(
    () => ({ YES: quoteBuy(state, "YES", stake).payout, NO: quoteBuy(state, "NO", stake).payout }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card.qYes, card.qNo, card.liquidity, stake],
  );

  const done = Boolean(answer);
  const intent: Side | null = dx > 24 ? "YES" : dx < -24 ? "NO" : null;
  const strength = Math.min(1, Math.abs(dx) / DRAG_COMMIT);

  function onPointerDown(e: React.PointerEvent) {
    if (done || locked || e.pointerType === "mouse") return;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, axis: "?" };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const mx = e.clientX - d.x0;
    const my = e.clientY - d.y0;
    if (d.axis === "?") {
      if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
      // let the browser keep the vertical scroll; only take over sideways drags
      d.axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      if (d.axis === "x") {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }
    }
    if (d.axis === "x") setDx(mx);
  }

  function endDrag(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    // כן sits on the right everywhere on this site, so a drag to the right is כן
    const committed = Math.abs(dx) >= DRAG_COMMIT ? (dx > 0 ? "YES" : "NO") : null;
    setDx(0);
    if (committed) onAnswer(committed);
  }

  return (
    <article
      className="card relative flex h-full flex-col overflow-hidden"
      style={{
        transform: dx ? `translateX(${dx}px) rotate(${dx / 60}deg)` : undefined,
        transition: dragging || reduceMotion ? undefined : "transform 0.2s ease-out",
        touchAction: "pan-y",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {intent && !done && (
        <div
          className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center ${intent === "YES" ? "bg-yes/20" : "bg-no/20"}`}
          style={{ opacity: strength }}
          aria-hidden
        >
          <span className={`text-6xl font-black ${intent === "YES" ? "text-yes" : "text-no"}`}>
            {intent === "YES" ? "כן" : "לא"}
          </span>
        </div>
      )}

      {answer && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-bg/85 px-6 text-center">
          <div
            className={`text-5xl font-black ${
              answer.status === "error" ? "text-no" : answer.side === "YES" ? "text-yes" : "text-no"
            }`}
          >
            {answer.status === "error" ? "שגיאה" : answer.side === "YES" ? "כן" : "לא"}
          </div>
          {answer.status === "error" ? (
            <p className="max-w-xs text-sm text-no">{answer.error}</p>
          ) : (
            <p className="tabular text-sm text-muted">
              {money(answer.stake)} · {answer.status === "ok" ? `${fmtShares(answer.shares ?? 0)} מניות` : "נשלח…"}
            </p>
          )}
        </div>
      )}

      <div className="scrollbar-none flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <span
            className="rounded-md px-1.5 py-0.5 font-semibold"
            style={{ background: `${card.categoryAccent}22`, color: card.categoryAccent }}
          >
            {card.categoryLabel}
          </span>
          <span>{closesLabel(card.closesAt)}</span>
          {card.byTeam && <span className="text-muted-2">{SITE_TEAM}</span>}
          <Link
            href={`/market/${card.id}`}
            target="_blank"
            className="ms-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 hover:text-text-strong"
          >
            פרטים
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </Link>
        </div>

        <div className="flex flex-1 items-center gap-3">
          <MarketImage
            src={card.image}
            fallback={card.fallbackImage}
            alt={card.personName ?? ""}
            className="h-14 w-14 shrink-0 rounded-2xl border border-border object-cover sm:h-20 sm:w-20"
          />
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold leading-tight text-text-strong sm:text-2xl">{card.title}</h2>
            {card.subtitle && <p className="mt-1 line-clamp-2 text-sm text-muted">{card.subtitle}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="tabular font-semibold text-yes">כן {pct(card.probability)}</span>
            <span className="text-muted-2">מחיר השוק כרגע</span>
            <span className="tabular font-semibold text-no">לא {pct(1 - card.probability)}</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className="bg-yes" style={{ width: `${card.probability * 100}%` }} />
            <div className="flex-1 bg-no" />
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-border p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2">
          <AnswerButton
            side="YES"
            stake={stake}
            price={card.probability}
            payout={payouts.YES}
            disabled={done || locked}
            hint={showKeys ? "→" : undefined}
            onClick={() => onAnswer("YES")}
          />
          <AnswerButton
            side="NO"
            stake={stake}
            price={1 - card.probability}
            payout={payouts.NO}
            disabled={done || locked}
            hint={showKeys ? "←" : undefined}
            onClick={() => onAnswer("NO")}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-2">
          <button onClick={onSkip} className="shrink-0 rounded-md px-2 py-1 font-semibold hover:text-text-strong">
            דלג
          </button>
          <span className="line-clamp-2 text-end">
            {outOfMoney
              ? "נגמרה היתרה — אפשר למכור פוזיציות בדף השוק"
              : locked
                ? "היתרה לא מספיקה לסכום הזה"
                : loggedIn
                  ? "הסכום מחייב · מספר המניות משוער"
                  : "התחברו כדי שהתשובות ייספרו"}
          </span>
        </div>
      </div>
    </article>
  );
}

function AnswerButton({
  side,
  stake,
  price,
  payout,
  disabled,
  hint,
  onClick,
}: {
  side: Side;
  stake: number;
  price: number;
  payout: number;
  disabled: boolean;
  hint?: string;
  onClick: () => void;
}) {
  const yes = side === "YES";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={`${yes ? "כן" : "לא"} ב־${stake} שקלים וירטואליים`}
      className={`rounded-2xl py-3 text-center text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${
        yes ? "bg-yes hover:bg-yes-2" : "bg-no hover:bg-no-2"
      }`}
    >
      <span className="flex items-center justify-center gap-2 text-2xl font-black leading-none">
        {hint && (
          <span className="text-sm font-bold opacity-60" aria-hidden>
            {hint}
          </span>
        )}
        {yes ? "כן" : "לא"}
        <span className="tabular text-sm font-bold opacity-80">{agora(price)}</span>
      </span>
      <span className="tabular mt-1 block text-[11px] font-semibold opacity-90">
        {money(stake)} ← ≈{money(payout)} אם צדקת
      </span>
    </button>
  );
}

/* ------------------------------------------------------------ stake bar -- */

function StakeBar({
  stake,
  available,
  broke,
  outOfMoney,
  showKeys,
  dimmed,
}: {
  stake: number;
  available: number | null;
  broke: boolean;
  outOfMoney: boolean;
  showKeys: boolean;
  dimmed: boolean;
}) {
  return (
    <div className={`card shrink-0 p-3 transition-opacity ${dimmed ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between">
        <label htmlFor="rapid-stake" className="text-xs font-semibold text-text">
          סכום מחייב לכל תשובה
        </label>
        <span className="tabular text-2xl font-black text-text-strong">{money(stake)}</span>
      </div>
      <input
        id="rapid-stake"
        type="range"
        min={RAPID_MIN_STAKE}
        max={RAPID_MAX_STAKE}
        step={1}
        value={stake}
        onChange={(e) => writeStake(Number(e.target.value))}
        className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-3 accent-accent"
        aria-describedby="rapid-stake-range"
      />
      <div className="scrollbar-none mt-2 flex gap-1.5 overflow-x-auto">
        {RAPID_STAKE_PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => writeStake(p)}
            className={`tabular shrink-0 rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
              stake === p
                ? "border-accent bg-accent/15 text-accent-2"
                : "border-border bg-surface-2 text-muted hover:text-text-strong"
            }`}
          >
            ₪{p}
          </button>
        ))}
      </div>
      <p id="rapid-stake-range" className="tabular mt-1.5 truncate text-[11px] text-muted-2">
        טווח ₪{RAPID_MIN_STAKE}–₪{RAPID_MAX_STAKE} · יורד מהיתרה מיד
        {available != null && (
          <span className={broke ? "text-no" : ""}>
            {" · "}
            {outOfMoney ? "נגמרה היתרה" : `מספיק ל־${Math.max(0, Math.floor(available / stake))} תשובות`}
          </span>
        )}
      </p>
      {showKeys && (
        <p className="mt-2 border-t border-border pt-2 text-[11px] text-muted-2">
          מקלדת: <Kbd>→</Kbd> כן · <Kbd>←</Kbd> לא · <Kbd>רווח</Kbd> דלג · <Kbd>+</Kbd>/<Kbd>−</Kbd> סכום ·{" "}
          <Kbd>1</Kbd>–<Kbd>5</Kbd> סכום קבוע
        </p>
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded bg-surface-2 px-1 font-sans text-text">{children}</kbd>;
}

/* ---------------------------------------------------------- run summary -- */

function RunSummary({
  done,
  failed,
  firstError,
  total,
  yesCount,
  totalStaked,
  totalPayout,
  showActions,
  onRestart,
}: {
  done: number;
  failed: number;
  firstError?: string;
  total: number;
  yesCount: number;
  totalStaked: number;
  totalPayout: number;
  showActions: boolean;
  onRestart: () => void;
}) {
  return (
    <div className="card flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-2xl font-black text-text-strong">{done ? "סיימת את הרצף" : "לא ענית על אף שאלה"}</h2>
      {done ? (
        <>
          <p className="text-muted">
            ענית על <strong className="tabular text-text-strong">{done}</strong> מתוך {total} שאלות ·{" "}
            <span className="text-yes">{yesCount} כן</span> · <span className="text-no">{done - yesCount} לא</span>
          </p>
          <dl className="grid w-full max-w-md grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <dt className="text-xs text-muted">הושקעו</dt>
              <dd className="tabular text-xl font-extrabold text-text-strong">{money(totalStaked)}</dd>
            </div>
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <dt className="text-xs text-muted">תשלום אם תצדקו בכל התשובות</dt>
              <dd className="tabular text-xl font-extrabold text-yes">{money(totalPayout)}</dd>
            </div>
          </dl>
          {failed > 0 && (
            <p className="rounded-lg bg-no/10 px-3 py-2 text-sm text-no">
              {failed} תשובות לא נקלטו{firstError ? ` (${firstError})` : ""}. אפשר לנסות אותן שוב בעמוד השוק.
            </p>
          )}
        </>
      ) : (
        <p className="max-w-sm text-muted">גללו למעלה כדי לחזור לשאלות, או עברו לרשימת השווקים המלאה.</p>
      )}
      {showActions && (
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/portfolio" className="rounded-xl bg-accent px-5 py-2.5 font-bold text-white hover:bg-accent-2">
            לתיק שלי
          </Link>
          <button onClick={onRestart} className="rounded-xl border border-border-2 px-5 py-2.5 font-semibold hover:bg-surface-2">
            חזרה לשאלות
          </button>
          <Link href="/" className="rounded-xl border border-border-2 px-5 py-2.5 font-semibold hover:bg-surface-2">
            לכל השווקים
          </Link>
        </div>
      )}
    </div>
  );
}
