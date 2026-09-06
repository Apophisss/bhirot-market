"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { BoltIcon } from "./BoltIcon";
import { useRouter } from "next/navigation";
import { quoteBuy, type MarketState, type Side } from "@/lib/lmsr";
import { money, pct, closesLabel } from "@/lib/format";
import { SITE_TEAM } from "@/lib/config";
import { STARTING_BALANCE } from "@/lib/limits";
import {
  RAPID_MAX_STAKE,
  RAPID_MIN_STAKE,
  RAPID_STAKE_PRESETS,
  RAPID_STAKE_STEP,
  type RapidCard,
} from "@/lib/rapid";
import { setRapidStake, useRapidStake } from "@/lib/settings-client";
import { addSkips, openSkipSnapshot, serverSkipSnapshot, skipSnapshot, subscribeSkipSnapshot } from "@/lib/rapid-skips";
import {
  GUEST_LIMIT,
  GUEST_RECAP_LIMIT,
  addGuestAnswer,
  guestGateReached,
  readGuestAnswers,
  serverGuestAnswers,
  subscribeGuestAnswers,
  type GuestAnswer,
} from "@/lib/rapid-guest";
import { MarketImage } from "./MarketImage";
import { RapidSpark } from "./RapidSpark";
import { gaEvent } from "@/lib/gtag";
import { track } from "@/lib/track";
import { EVENTS } from "@/lib/events";
import { checkAdConversions } from "@/components/AdConversions";

/**
 * `held` is an answer that has been made but not yet sent: it exists only while the
 * undo window below is open. Everything downstream treats it as committed money
 * (see `pendingSpend`), because it is about to be.
 */
type AnswerStatus = "held" | "pending" | "ok" | "error" | "guest";

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
/**
 * How long an answer can be taken back.
 *
 * Rapid mode is a single tap that spends real (virtual) money and opens a
 * position, one card every couple of seconds — the one interaction on the site
 * with no confirmation step and, until now, no way back from a mis-tap. Rather
 * than reversing a trade after the fact (which would sell back at a different
 * price and cost the user the spread for the site's own missing safety net), the
 * answer simply waits here before it is sent. Leaving the deck flushes it: the
 * answer stands, it was only ever the *sending* that was deferred.
 */
const UNDO_MS = 5000;
/**
 * How long skips are gathered before they are sent.
 *
 * A skip is not money and nobody is waiting for it, so the deck collects them and
 * sends one request rather than one per card — a fast run passes a card every
 * couple of seconds. Whatever is still waiting goes out when the deck unmounts or
 * the page is hidden, so a skip is never lost to leaving.
 */
const SKIP_FLUSH_MS = 2500;
/** how many skips one request carries — the endpoint's own cap (api/rapid/skip) */
const SKIP_BATCH = 60;

/** horizontal drag distance (px) that commits an answer */
const DRAG_COMMIT = 96;
/** downward drag distance (px) that sends the undo bar away */
const UNDO_DISMISS = 44;
/**
 * A downward flick this fast (px per ms) sends the bar away whatever the distance.
 * Forgiving on purpose: dismissing costs nothing — the answer goes out exactly as
 * the five-second timer was about to send it — so a gesture that was clearly meant
 * as "get this off my screen" should not have to be measured out.
 */
const UNDO_FLICK = 0.35;
/** how long the undo bar takes to slide off screen once it has been dismissed */
const UNDO_EXIT_MS = 160;
/** wheel distance (px) that counts as one deliberate "next card" gesture */
const WHEEL_STEP = 42;
/** how long the deck ignores the wheel after a step, so one flick moves one card */
const WHEEL_COOLDOWN_MS = 380;

/**
 * Does anything between `from` and `stopAt` still have room to scroll by `dy`?
 * The card body scrolls on its own when its question is long, and the deck must
 * not steal the wheel from it.
 */
function scrollableUnder(from: EventTarget | null, stopAt: HTMLElement, dy: number): boolean {
  let el = from instanceof HTMLElement ? from : null;
  while (el && el !== stopAt) {
    const room = el.scrollHeight - el.clientHeight;
    if (room > 1 && getComputedStyle(el).overflowY !== "visible") {
      if (dy > 0 ? el.scrollTop < room - 1 : el.scrollTop > 1) return true;
    }
    el = el.parentElement;
  }
  return false;
}

/* ------------------------------------------------- the stake, as a store --
 * The chosen stake used to live in `localStorage` alone, which meant it lived in
 * one browser: the same account picked ₪50 on a phone and was handed ₪20 again on
 * a laptop. It is a choice the user made, like every other choice on the site, so
 * it belongs to the account — `savedStake` arrives already rendered from the
 * server, and `setRapidStake` writes it back (src/lib/settings-client.ts).
 * A guest, with no account to write to, keeps the browser store as before.
 */

/** The answers this browser gave before signing in (see src/lib/rapid-guest.ts). */
function useGuestAnswers() {
  return useSyncExternalStore(subscribeGuestAnswers, readGuestAnswers, serverGuestAnswers);
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
  savedStake = null,
  includeAnswered = false,
  children,
}: {
  cards: RapidCard[];
  loggedIn: boolean;
  balance: number | null;
  /** the stake this account chose, whatever device it chose it on — null for a guest */
  savedStake?: number | null;
  /** the "כולל שאלות שכבר ראיתי" switch — it puts back both what was answered and what
   *  was skipped, and for a guest it is the only thing that keeps an already-answered
   *  question in the queue, since the server cannot filter for them */
  includeAnswered?: boolean;
  /** shown instead of the deck when the feed came back empty */
  children: React.ReactNode;
}) {
  const router = useRouter();
  // The deck runs off a snapshot of the feed it was mounted with. Answering a
  // question removes it from the server-side feed, so refreshing at the end of a
  // run would otherwise pull every card — and the summary — out from under the
  // user. Changing a filter navigates with a new key, which remounts with fresh
  // cards; see the key on <RapidDeck> in app/rapid/page.tsx.
  const [allCards] = useState(cards);
  const scroller = useRef<HTMLDivElement>(null);
  const queue = useRef<Answer[]>([]);
  /** ids already sent or waiting to be sent — the ref is a render ahead of `answers` */
  const claimed = useRef(new Set<string>());
  const draining = useRef(false);
  const alive = useRef(true);
  /** index a programmatic scroll is heading to — scroll events are ignored until it lands */
  const target = useRef<number | null>(null);
  const targetTimer = useRef(0);
  const advanceTimer = useRef(0);
  /** marketId -> the timer that will release that answer to the queue */
  const holdTimers = useRef(new Map<string, number>());
  /** the answers still inside their undo window, outside React state on purpose:
   *  releasing one has to enqueue a network job, and a state updater must stay pure
   *  (React runs it twice in development, which would send the answer twice) */
  const holdJobs = useRef(new Map<string, Answer>());
  /** skips waiting to be sent, and the timer that will send them */
  const pendingSkips = useRef<string[]>([]);
  const skipTimer = useRef(0);
  /** the furthest card the run has already judged — everything before it was answered or skipped */
  const judged = useRef(0);

  const stake = useRapidStake(savedStake);
  /** the account gets the choice written back to it; a guest gets the browser store */
  const setStake = useCallback((v: number) => setRapidStake(v, loggedIn), [loggedIn]);
  const guestAnswers = useGuestAnswers();
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const showKeys = useMediaQuery("(min-width: 1024px)");

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [liveBalance, setLiveBalance] = useState<number | null>(balance);
  const [halted, setHalted] = useState(false);
  /** the answer currently inside its undo window, and when the window closes */
  const [held, setHeld] = useState<{ card: RapidCard; side: Side; until: number } | null>(null);
  /**
   * The questions this browser skipped *before* this run.
   *
   * Taken once, when the deck mounts, and frozen there: a skip made now must not
   * take its own card out of the deck while the user is looking at it — the run
   * would renumber itself under their finger. Skipping is a message to the next
   * visit. (`localStorage` also does not exist on the server, hence the store —
   * see src/lib/rapid-skips.ts.)
   */
  const hiddenSkips = useSyncExternalStore(subscribeSkipSnapshot, skipSnapshot, serverSkipSnapshot);
  useEffect(() => openSkipSnapshot(), []);

  /*
    The queue, minus what this browser has already answered.
    ------------------------------------------------------------------------
    For a signed-in user the server does this: `listRapidCards` drops what the
    account has answered. A guest has no account, so three answers given on
    `/welcome` came back as three unanswered cards — the deck said "נענו 0",
    offered them all again, and the answer given the second time was thrown away
    by a store that only ever inserted (see addGuestAnswer).

    An answer given *during this run* keeps its card: `answers` holds it, and the
    card is what the answered overlay and the undo bar are pointing at. Only an
    answer carried in from an earlier screen takes its question out of the queue —
    and "כולל שאלות שכבר ראיתי" puts them all back, for a guest exactly as it does
    for an account.
  */
  const carried = useMemo(() => {
    const m: Record<string, Side> = {};
    if (loggedIn) return m;
    for (const a of guestAnswers) if (!answers[a.marketSlug]) m[a.marketSlug] = a.side;
    return m;
  }, [answers, guestAnswers, loggedIn]);

  /*
    What is left to answer: the deck minus what this browser already settled.

    Two subtractions, and only the first one is the server's. `carried` is a guest's
    own answers; `hiddenSkips` is every question — guest or signed in — that was
    skipped in an earlier run. For a signed-in user the server has already dropped
    both (positions and `rapid_skip`), so this filter only catches the skips of the
    last few seconds, the ones made after this page was rendered. "כולל שאלות שכבר
    ראיתי" puts everything back.
  */
  const feed = useMemo(
    () => (includeAnswered ? allCards : allCards.filter((c) => !(c.id in carried) && !hiddenSkips.has(c.id))),
    [allCards, carried, hiddenSkips, includeAnswered],
  );

  useEffect(() => {
    alive.current = true;
    const timers = holdTimers.current;
    return () => {
      alive.current = false;
      window.clearTimeout(targetTimer.current);
      window.clearTimeout(advanceTimer.current);
      for (const t of timers.values()) window.clearTimeout(t);
    };
  }, []);

  /**
   * Every answer this browser has on the board: the ones given here, over the ones
   * carried in from `/welcome` or from an earlier run. The counter, the tape and the
   * cards all read this — "נענו 0" beside a question the visitor answered a minute
   * ago is the deck telling them their answer was not kept.
   */
  const shownAnswers = useMemo(() => {
    if (loggedIn || !guestAnswers.length) return answers;
    const merged: Record<string, Answer> = {};
    for (const a of guestAnswers) merged[a.marketSlug] = { marketId: a.marketSlug, side: a.side, stake, status: "guest" };
    return { ...merged, ...answers };
  }, [answers, guestAnswers, loggedIn, stake]);

  const answered = useMemo(() => Object.values(shownAnswers), [shownAnswers]);
  const pendingCount = answered.filter((a) => a.status === "pending" || a.status === "held").length;
  /** money committed by answers the server has not confirmed yet — held ones included */
  const pendingSpend = answered.reduce((s, a) => s + (a.status === "pending" || a.status === "held" ? a.stake : 0), 0);
  const available = liveBalance == null ? null : liveBalance - pendingSpend;
  const broke = halted || (available != null && available < stake);
  const outOfMoney = halted || (available != null && available < RAPID_MIN_STAKE);

  const okCount = answered.filter((a) => a.status === "ok" || a.status === "guest").length;
  /** a signed-out visitor has used up the free run and the next tap is the sign-in gate */
  const guestGate = !loggedIn && guestGateReached(guestAnswers);
  const failedCount = answered.filter((a) => a.status === "error").length;

  const goTo = useCallback(
    (i: number, delay = 0) => {
      const clamped = Math.max(0, Math.min(feed.length, i));
      window.clearTimeout(advanceTimer.current);
      const run = () => {
        const el = scroller.current;
        if (!el) return;
        target.current = clamped;
        // The counter moves with the intent, not with the animation. A mandatory
        // snap container can swallow a smooth `scrollTo` outright, and when it did
        // the deck answered the question, counted it, and then sat on the same card
        // under "1 / 60" — an answer that goes nowhere reads as an answer that was
        // not taken, which is the one thing rapid mode may not do.
        setIndex(clamped);
        el.scrollTo({ top: clamped * el.clientHeight, behavior: reduceMotion ? "auto" : "smooth" });
        window.clearTimeout(targetTimer.current);
        targetTimer.current = window.setTimeout(() => {
          // the landing scroll event can go missing (interrupted scroll, or a
          // scrollTo that was already a no-op) — re-derive rather than leaving
          // `index` pointing at a card that is not on screen
          target.current = null;
          if (!el.clientHeight) return;
          const landed = Math.round(el.scrollTop / el.clientHeight);
          if (landed === clamped) {
            setIndex(landed);
            return;
          }
          // the animation never arrived: put the deck where it was asked to go,
          // without one. Better an abrupt card than the previous one.
          el.scrollTo({ top: clamped * el.clientHeight, behavior: "auto" });
          setIndex(clamped);
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
              : { ...job, status: "error", error: data?.error ?? "לא הצלחנו לקלוט את התשובה" };
        } catch {
          patch = { ...job, status: "error", error: "שגיאת רשת" };
        }
        // reported before the unmount check below: the trade happened either way
        if (patch.status === "ok") gaEvent("rapid_answer", { market_id: job.marketId, side: job.side, stake: job.stake });
        if (patch.status === "ok") checkAdConversions();
        // out of money: every queued answer after this one would fail the same way,
        // so stop the run instead of firing a burst of doomed requests
        const stranded = data?.code === "INSUFFICIENT_BALANCE" ? queue.current.splice(0) : [];
        if (!alive.current) continue; // unmounted mid-run: keep sending, stop painting
        if (patch.status === "ok" && typeof data?.balance === "number") setLiveBalance(data.balance);
        if (stranded.length || data?.code === "INSUFFICIENT_BALANCE") setHalted(true);
        setAnswers((prev) => {
          const next = { ...prev, [job.marketId]: patch };
          for (const s of stranded) next[s.marketId] = { ...s, status: "error", error: "נגמרו הנקודות" };
          return next;
        });
      }
    } finally {
      draining.current = false;
    }
  }, []);

  /**
   * Sends a held answer for real. Idempotent: a job already released (by its own
   * timer, by the next answer, or by leaving the deck) has no timer left to clear
   * and is not queued twice.
   */
  const release = useCallback(
    (marketId: string) => {
      const job = holdJobs.current.get(marketId);
      if (!job) return;
      const timer = holdTimers.current.get(marketId);
      if (timer != null) window.clearTimeout(timer);
      holdTimers.current.delete(marketId);
      holdJobs.current.delete(marketId);
      const sent: Answer = { ...job, status: "pending" };
      queue.current.push(sent);
      void drain();
      setAnswers((prev) => (prev[marketId]?.status === "held" ? { ...prev, [marketId]: sent } : prev));
      setHeld((h) => (h?.card.id === marketId ? null : h));
    },
    [drain],
  );

  /**
   * Sends every answer still inside its window. `drain` never changes identity, so
   * this does not either — which is what lets the unmount effect below depend on it
   * and still run exactly once, at unmount.
   */
  const flushHeld = useCallback(() => {
    const jobs = [...holdJobs.current.values()];
    if (!jobs.length) return;
    holdJobs.current.clear();
    for (const t of holdTimers.current.values()) window.clearTimeout(t);
    holdTimers.current.clear();
    const sent = jobs.map((j) => ({ ...j, status: "pending" as const }));
    queue.current.push(...sent);
    void drain();
    setAnswers((prev) => {
      const next = { ...prev };
      for (const j of sent) next[j.marketId] = j;
      return next;
    });
    setHeld(null);
  }, [drain]);

  // Leaving the deck closes the undo window rather than cancelling the answer:
  // every held job is released here, and `drain` keeps sending after the unmount
  // (it checks `alive` only before painting, never before posting).
  useEffect(() => flushHeld, [flushHeld]);

  /* ------------------------------------------------------------- the skips --
   * A card the run moves past without answering it was skipped — by the "דלג"
   * button, by the space bar, by a swipe or by the wheel, it makes no difference:
   * the user was shown the question and moved on. That is written down, so the
   * next visit opens on a question they have not seen instead of on the one they
   * just waved away.
   */

  /** what the deck knows about every card right now, for the effect below */
  const answersRef = useRef(shownAnswers);
  useEffect(() => {
    answersRef.current = shownAnswers;
  }, [shownAnswers]);

  /** Hands skips to the account, in the batches the endpoint accepts. */
  const postSkips = useCallback((ids: string[]) => {
    for (let i = 0; i < ids.length; i += SKIP_BATCH) {
      void fetch("/api/rapid/skip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ marketIds: ids.slice(i, i + SKIP_BATCH) }),
        // this also fires while the page is going away, where a plain fetch is cancelled
        keepalive: true,
      }).catch(() => {
        // the browser's own list already has them, and nothing here is money:
        // a lost skip is not worth a retry
      });
    }
  }, []);

  const flushSkips = useCallback(() => {
    window.clearTimeout(skipTimer.current);
    const ids = pendingSkips.current.splice(0);
    if (ids.length) postSkips(ids);
  }, [postSkips]);

  const noteSkips = useCallback(
    (ids: string[]) => {
      // the browser's copy first — it is what a reload two seconds from now reads,
      // and it is all a signed-out visitor has
      const fresh = addSkips(ids);
      if (!fresh.length || !loggedIn) return;
      pendingSkips.current.push(...fresh);
      window.clearTimeout(skipTimer.current);
      skipTimer.current = window.setTimeout(flushSkips, SKIP_FLUSH_MS);
    },
    [flushSkips, loggedIn],
  );

  /* every card the run leaves behind unanswered, once, in the order it left them */
  useEffect(() => {
    if (index <= judged.current) return; // going back over the run judges nothing again
    const ids: string[] = [];
    for (let i = judged.current; i < index && i < feed.length; i++) {
      const card = feed[i];
      if (card && !answersRef.current[card.id]) ids.push(card.id);
    }
    judged.current = index;
    if (ids.length) noteSkips(ids);
  }, [feed, index, noteSkips]);

  /*
    The skips the account has not heard about.

    A card that is both on this browser's list and in the deck the server served
    is exactly that: the server drops what it knows was skipped, so anything that
    survived its filter and is on the list was skipped somewhere it could not be
    written down — before signing in, or in a request that never landed. Mounting
    is the moment to hand those over, and it costs at most one request, because
    the deck is only sixty cards long.
  */
  useEffect(() => {
    if (!loggedIn || includeAnswered) return;
    const unknown = allCards.filter((c) => hiddenSkips.has(c.id)).map((c) => c.id);
    if (unknown.length) postSkips(unknown);
  }, [allCards, hiddenSkips, includeAnswered, loggedIn, postSkips]);

  // leaving the deck, or hiding the page, sends whatever is still gathering
  useEffect(() => flushSkips, [flushSkips]);
  useEffect(() => {
    const onHide = () => flushSkips();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [flushSkips]);

  /** Takes an answer back while its window is still open, and scrolls back to the card. */
  const undo = useCallback(
    (marketId: string) => {
      if (!holdJobs.current.has(marketId)) return; // already sent — nothing left to undo
      const timer = holdTimers.current.get(marketId);
      if (timer != null) window.clearTimeout(timer);
      holdTimers.current.delete(marketId);
      holdJobs.current.delete(marketId);
      claimed.current.delete(marketId);
      setAnswers((prev) => {
        if (prev[marketId]?.status !== "held") return prev;
        const next = { ...prev };
        delete next[marketId];
        return next;
      });
      setHeld(null);
      const back = feed.findIndex((c) => c.id === marketId);
      if (back >= 0) goTo(back);
    },
    [feed, goTo],
  );

  const answer = useCallback(
    (card: RapidCard, side: Side) => {
      if (!loggedIn) {
        // The free run: the answer is kept in the browser and becomes a real position
        // on the way back from Google. Answering a question again replaces the earlier
        // answer rather than being dropped — the card shows the new side either way,
        // and a card that says "כן · נשמר" over a stored "לא" is a lie the store used
        // to tell (see addGuestAnswer).
        const known = guestAnswers.some((a) => a.marketSlug === card.id);
        addGuestAnswer({
          marketSlug: card.id,
          side,
          priceAtAnswer: side === "YES" ? card.probability : 1 - card.probability,
          title: card.title,
          // the amount the card was showing while it was answered — redemption binds
          // this, not the default (see GuestAnswer.stake)
          stake,
          ts: Date.now(),
        });
        setAnswers((prev) => ({ ...prev, [card.id]: { marketId: card.id, side, stake, status: "guest" } }));
        if (typeof navigator.vibrate === "function") navigator.vibrate(12);
        // Past the limit the answer is still taken — it is kept with the others and
        // listed on the sign-in screen — and the wall is what comes next.
        if (!known && guestAnswers.length >= GUEST_LIMIT) {
          router.push("/login?callbackUrl=%2Frapid");
          return;
        }
        goTo(feed.indexOf(card) + 1, ADVANCE_MS);
        return;
      }
      if (answers[card.id] || claimed.current.has(card.id) || broke) return; // answered already, or nothing left to bet
      claimed.current.add(card.id);
      // one window at a time: answering the next card commits the previous answer,
      // which is what a user who has already moved on means by moving on
      for (const id of [...holdTimers.current.keys()]) release(id);
      const job: Answer = { marketId: card.id, side, stake, status: "held" };
      holdJobs.current.set(card.id, job);
      setAnswers((prev) => ({ ...prev, [card.id]: job }));
      setHeld({ card, side, until: Date.now() + UNDO_MS });
      holdTimers.current.set(
        card.id,
        window.setTimeout(() => release(card.id), UNDO_MS),
      );
      if (typeof navigator.vibrate === "function") navigator.vibrate(12);
      goTo(feed.indexOf(card) + 1, ADVANCE_MS);
    },
    [answers, broke, feed, goTo, guestAnswers, loggedIn, release, router, stake],
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

  /* the wheel handler is bound once and reads the live index/goTo from here */
  const indexRef = useRef(0);
  const goToRef = useRef(goTo);
  useEffect(() => {
    indexRef.current = index;
    goToRef.current = goTo;
  }, [index, goTo]);

  /* mouse wheel and trackpad: one card per gesture.
   * The panels are mandatory snap targets, so a wheel notch that covers a fraction
   * of a panel just springs back to the card it started on — on a desktop the deck
   * looks stuck. Taking the wheel over turns every flick into a whole card. */
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let acc = 0;
    let last = 0;
    let until = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // pinch-to-zoom
      // DOM_DELTA_LINE / DOM_DELTA_PAGE (Firefox, some mice) report in lines/pages
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * el.clientHeight : e.deltaY;
      if (!dy || Math.abs(dy) <= Math.abs(e.deltaX)) return; // a sideways gesture is not ours
      if (scrollableUnder(e.target, el, dy)) return; // a long question is scrolling inside the card
      e.preventDefault();
      const now = e.timeStamp;
      if (now - last > 200 || Math.sign(dy) !== Math.sign(acc)) acc = 0; // new gesture
      last = now;
      if (now < until) return; // still riding out the previous step
      acc += dy;
      if (Math.abs(acc) < WHEEL_STEP) return;
      until = now + WHEEL_COOLDOWN_MS;
      goToRef.current(indexRef.current + (acc > 0 ? 1 : -1));
      acc = 0;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
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
        case " ":
          if (t?.closest("button, a, [role='button']")) return; // let the focused control handle it
        // fallthrough
        case "ArrowDown":
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
          setStake(stake + RAPID_STAKE_STEP);
          break;
        case "-":
        case "_":
          e.preventDefault();
          setStake(stake - RAPID_STAKE_STEP);
          break;
        default: {
          // 1…5 jump straight to a preset stake
          const preset = RAPID_STAKE_PRESETS[Number(e.key) - 1];
          if (preset != null) {
            e.preventDefault();
            setStake(preset);
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, feed, goTo, index, setStake, stake]);

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
  const totalStaked = answered.filter((a) => a.status === "ok").reduce((s, a) => s + a.stake, 0);
  const totalPayout = answered.filter((a) => a.status === "ok").reduce((s, a) => s + (a.shares ?? 0), 0);
  const yesCount = answered.filter((a) => a.side === "YES" && a.status === "ok").length;
  const firstError = answered.find((a) => a.status === "error")?.error;

  if (!feed.length) return <>{children}</>;

  return (
    // On a phone everything stacks. From lg the stake panel moves into a column of
    // its own: a laptop window is wide and short, so the height it gives back is
    // exactly what the card was missing.
    <section className="relative flex min-h-0 flex-1 flex-col gap-2 short:gap-1.5 lg:flex-row lg:items-stretch lg:gap-4">
      <div className="flex min-h-0 flex-1 flex-col gap-2 short:gap-1.5">
        {/* On a short phone this row is the first thing to go: the tape below it already
            shows where the run stands, and the balance moves into the stake strip. */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs short:hidden">
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
              ניקוד {money(Math.max(0, available ?? liveBalance))}
            </span>
          )}
        </header>

        <RunTape cards={feed} answers={shownAnswers} index={index} />

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
                previously={carried[card.id] ?? null}
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
              onRestart={() => {
                refreshed.current = false;
                goTo(0);
              }}
            />
          </div>
        </div>

        <p className="sr-only" aria-live="polite">
          {atSummary ? "סוף הרצף" : `שאלה ${index + 1} מתוך ${feed.length}: ${feed[index]?.title ?? ""}`}
        </p>
      </div>

      {/*
        The undo window, over the deck rather than on the card: by the time it opens
        the answered card has already scrolled away, so an affordance drawn on the
        card would be off screen for the whole five seconds it exists.

        Swiping it down closes the window early: the bar sits over the next question,
        and a user who does not want it there has already made up their mind — so the
        answer is sent, exactly as it would have been five seconds later.
      */}
      {held && (
        <UndoBar
          key={held.card.id}
          held={held}
          reduceMotion={reduceMotion}
          onUndo={() => undo(held.card.id)}
          onDismiss={() => {
            // a swipe is not a click, so the delegated tracker never sees it — and how
            // often the bar is pushed away is what says whether five seconds is too long
            track(EVENTS.click, { marketId: held.card.id, props: { id: "rapid-undo-dismiss" } });
            release(held.card.id);
          }}
        />
      )}

      {/* the free run is over, and the answers behind this are the argument */}
      {guestGate && <GuestGate answers={guestAnswers} />}

      <aside className="scrollbar-none shrink-0 lg:w-72 lg:overflow-y-auto xl:w-80">
        <StakeBar
          stake={stake}
          onStake={setStake}
          available={available}
          broke={broke}
          outOfMoney={outOfMoney}
          showKeys={showKeys}
          dimmed={atSummary}
        />
      </aside>
    </section>
  );
}

/* -------------------------------------------------------------- guest gate -- */

/**
 * The wall a signed-out visitor meets after `GUEST_LIMIT` answers.
 *
 * It is deliberately built out of what they just did rather than out of what the
 * site wants: the questions are listed with the side that was picked, because
 * "you have already answered ten questions — sign in and they start counting" is
 * an entirely different proposition from "sign in to continue".
 *
 * What it adds to that is the answer to the question a stranger actually has at
 * this moment, which is not "why should I" but "what does this cost me": the
 * account is free, it is one click of a Google button, and it opens the rest of
 * the game rather than merely removing an obstacle. Those three are stated here,
 * on the screen that asks, rather than left on a marketing page nobody is on.
 *
 * Only the last `GUEST_RECAP_LIMIT` answers are named. Ten rows plus a heading is
 * taller than a phone, and the row that would be pushed off the bottom is the
 * button — the recap is here to make the ask concrete, not to bury it.
 */
function GuestGate({ answers }: { answers: GuestAnswer[] }) {
  const listed = answers.slice(-GUEST_RECAP_LIMIT).reverse();
  const rest = answers.length - listed.length;
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-bg/92 p-3 backdrop-blur-sm">
      <div className="card max-h-full w-full max-w-md overflow-y-auto p-4 text-center sm:p-6">
        <h2 className="text-xl font-black text-text-strong sm:text-2xl">ענית על {answers.length} שאלות</h2>
        <p className="mt-1.5 text-sm text-muted">
          הרשמה חינם, בלחיצה אחת עם Google — התשובות שכבר נתתם נכנסות לניקוד, ואיתן{" "}
          {money(STARTING_BALANCE)} להמשך.
        </p>

        <ul className="mt-4 space-y-1.5 text-right">
          {listed.map((a) => (
            <li key={a.marketSlug} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-2">
              <span className={`shrink-0 text-sm font-black ${a.side === "YES" ? "text-yes" : "text-no"}`}>
                {a.side === "YES" ? "כן" : "לא"}
              </span>
              <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug text-text">{a.title}</span>
              <span className="tabular shrink-0 text-[13px] text-muted-2">{pct(a.priceAtAnswer)}</span>
            </li>
          ))}
          {rest > 0 && (
            <li className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[13px] text-muted">
              ועוד {rest} {rest === 1 ? "תשובה" : "תשובות"} שנשמרו לכם
            </li>
          )}
        </ul>

        {/* what the account opens, in the words of things to do — not "הטבות" */}
        <ul className="mt-3 grid list-inside list-disc gap-1 text-right text-[13px] leading-snug text-muted">
          <li>להמשיך לענות בלי הגבלה, על כל הלוח</li>
          <li>לעלות בטבלת המובילים ולראות כמה פעמים צדקתם</li>
          <li>לפתוח ליגה עם חברים ולראות מי מוביל</li>
          <li>לעקוב אחרי התיק שלכם — כמה שווה כל תשובה עכשיו</li>
        </ul>

        <Link
          href="/login?callbackUrl=%2Frapid"
          data-evt="rapid-guest-gate"
          className="tap pressable mt-4 flex w-full items-center justify-center rounded-xl bg-accent px-5 text-base font-extrabold text-white shadow-md shadow-accent/25 hover:bg-accent-2"
        >
          הרשמה חינם · והתשובות נשמרות
        </Link>
        <p className="mt-2 text-[13px] text-muted-2">
          בלי אשראי ובלי טופס — שם, אימייל ותמונה מ-Google. התשובות שמורות בדפדפן שלכם עד ההתחברות. נקודות משחק בלבד.
        </p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- undo bar -- */

/**
 * "Answered — undo", with the seconds left on it.
 *
 * The countdown is derived from a deadline rather than counted down in state, so a
 * backgrounded tab (where timers are throttled) shows the true remaining time when
 * it comes back instead of a stale one.
 *
 * The bar can also be swiped down to get rid of it — it lands over the bottom of the
 * next question, and five seconds is a long time to look at an offer you have already
 * turned down. Swiping it away is not a cancel and not a second undo: `onDismiss`
 * closes the window the way leaving the deck does, by sending the answer.
 */
function UndoBar({
  held,
  reduceMotion,
  onUndo,
  onDismiss,
}: {
  held: { card: RapidCard; side: Side; until: number };
  reduceMotion: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  // keyed on the answered card, so a new answer remounts this with a fresh deadline
  // rather than needing an effect to reset the clock
  const [left, setLeft] = useState(() => Math.max(0, held.until - Date.now()));
  /** how far down the finger has taken the bar */
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  /** swiped away: the bar is on its way off screen and the answer is about to go */
  const [gone, setGone] = useState(false);
  const drag = useRef<{ id: number; x0: number; y0: number; t0: number; dy: number; axis: "?" | "x" | "y" } | null>(
    null,
  );

  useEffect(() => {
    const tick = window.setInterval(() => setLeft(Math.max(0, held.until - Date.now())), 200);
    return () => window.clearInterval(tick);
  }, [held.until]);

  /* the callback is an inline arrow up in the deck, so it is a fresh function on every
     render — and this component re-renders four times a second. Through a ref, so the
     exit timer below is started once instead of being restarted by each tick. */
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });

  useEffect(() => {
    if (!gone) return;
    if (reduceMotion) {
      dismiss.current();
      return;
    }
    const t = window.setTimeout(() => dismiss.current(), UNDO_EXIT_MS);
    return () => window.clearTimeout(t);
  }, [gone, reduceMotion]);

  function onPointerDown(e: React.PointerEvent) {
    if (gone || e.button > 0) return;
    if (e.pointerType === "mouse") {
      // a mouse press on "בטל" belongs to the button, never to the swipe
      const t = e.target as HTMLElement | null;
      if (t?.closest("button, a, [role='button']")) return;
    }
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, dy: 0, axis: "?" };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const mx = e.clientX - d.x0;
    const my = e.clientY - d.y0;
    if (d.axis === "?") {
      if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
      d.axis = Math.abs(my) > Math.abs(mx) ? "y" : "x";
      if (d.axis !== "y") {
        drag.current = null; // a sideways gesture is not ours
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    // down only: the bar has nowhere to go upwards, so a pull that way is resisted
    d.dy = my > 0 ? my : my / 4;
    setDy(d.dy);
  }

  function endDrag(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (d.axis !== "y") return;
    // the distance comes off the ref rather than the `dy` state, which React can
    // still be a frame behind — the same reason the card's own swipe does
    const flick = d.dy > 12 && d.dy / Math.max(1, e.timeStamp - d.t0) >= UNDO_FLICK;
    if (d.dy >= UNDO_DISMISS || flick) {
      setGone(true);
      return;
    }
    setDy(0); // not far enough: back where it was
  }

  /** the OS took the gesture away — put the bar back rather than reading it as a swipe */
  function cancelDrag(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    setDy(0);
  }

  const seconds = Math.ceil(left / 1000);
  return (
    <div className="pb-safe pointer-events-none absolute inset-x-0 bottom-2 z-30 flex justify-center px-3 lg:bottom-3">
      <div
        className={`slide-up flex max-w-md items-center gap-3 rounded-full border border-border bg-surface px-3 py-1.5 shadow-lg shadow-ink/15 ${
          // once it is on its way out it stops taking taps: the answer is already going
          gone ? "pointer-events-none" : "pointer-events-auto"
        } ${dragging ? "cursor-grabbing select-none" : "cursor-grab"}`}
        style={{
          transform: gone ? "translateY(160%)" : dy ? `translateY(${dy}px)` : undefined,
          opacity: gone ? 0 : dy > 0 ? Math.max(0.35, 1 - dy / (UNDO_DISMISS * 2.5)) : undefined,
          transition:
            dragging || reduceMotion
              ? undefined
              : `transform ${UNDO_EXIT_MS}ms ease-out, opacity ${UNDO_EXIT_MS}ms ease-out`,
          // the swipe is ours: without this the browser scrolls the page under it
          touchAction: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
        onDragStart={(e) => e.preventDefault()}
      >
        <span className={`shrink-0 text-sm font-black ${held.side === "YES" ? "text-yes" : "text-no"}`}>
          {held.side === "YES" ? "כן" : "לא"}
        </span>
        <span className="line-clamp-1 min-w-0 flex-1 text-xs text-muted">{held.card.title}</span>
        <button
          onClick={onUndo}
          data-evt="rapid-undo"
          className="tap pressable inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-3 text-xs font-bold text-text-strong hover:bg-surface-3"
        >
          בטל
          <span className="tabular text-muted-2">{seconds}</span>
        </button>
      </div>
    </div>
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
  previously = null,
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
  /**
   * The side this browser answered on an earlier screen, if any.
   *
   * Kept apart from `answer` on purpose. An answer given in this run is finished —
   * it is on its way to the server and the card is closed over it. An answer
   * carried in from `/welcome` is a decision that can still be changed, and it is
   * only on screen at all under "כולל שאלות שכבר ראיתי", which is a request to
   * revisit it. So the card is marked rather than sealed, and answering again
   * replaces the stored answer (see addGuestAnswer).
   */
  previously?: Side | null;
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
  const drag = useRef<{ id: number; x0: number; y0: number; dx: number; axis: "?" | "x" | "y" } | null>(null);

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
    if (done || locked) return;
    if (e.button > 0) return; // right/middle click is not a swipe
    if (e.pointerType === "mouse") {
      // A finger can start a swipe anywhere on the card, but a mouse press on a
      // control belongs to that control — never turn a click on "דלג" or on an
      // answer button into a drag.
      const t = e.target as HTMLElement | null;
      if (t?.closest("button, a, input, label, [role='button']")) return;
    }
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, axis: "?" };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const mx = e.clientX - d.x0;
    const my = e.clientY - d.y0;
    if (d.axis === "?") {
      if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
      // A finger has to keep the vertical scroll, so only a sideways drag is taken.
      // A mouse has no drag-to-scroll to protect: any press-and-move is a swipe.
      d.axis = e.pointerType === "mouse" || Math.abs(mx) > Math.abs(my) ? "x" : "y";
      if (d.axis === "x") {
        e.currentTarget.setPointerCapture(e.pointerId);
        // a mouse drag across text would otherwise paint a selection behind the card
        if (e.pointerType === "mouse") window.getSelection()?.removeAllRanges();
        setDragging(true);
      }
    }
    if (d.axis === "x") {
      d.dx = mx;
      setDx(mx);
    }
  }

  function endDrag(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    setDx(0);
    if (d.axis !== "x") return;
    // the distance comes off the ref, not the `dx` state: React batches
    // pointermove, so the state can be a frame behind where the finger really
    // was — and this commits money. (Nor from e.clientX: a pointerup can arrive
    // without usable coordinates.)
    // כן sits on the right everywhere on this site, so a drag to the right is כן
    if (Math.abs(d.dx) >= DRAG_COMMIT) onAnswer(d.dx > 0 ? "YES" : "NO");
  }

  /** the OS took the gesture away — unwind it, never treat it as a deliberate answer */
  function cancelDrag(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    setDx(0);
  }

  return (
    <article
      className={`card relative flex h-full flex-col overflow-hidden ${dragging ? "select-none" : ""}`}
      style={{
        transform: dx ? `translateX(${dx}px) rotate(${dx / 60}deg)` : undefined,
        transition: dragging || reduceMotion ? undefined : "transform 0.2s ease-out",
        touchAction: "pan-y",
        cursor: done || locked ? undefined : dragging ? "grabbing" : "grab",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={cancelDrag}
      /* the browser's own image/text drag would fight the swipe */
      onDragStart={(e) => e.preventDefault()}
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
              {money(answer.stake)} ·{" "}
              {answer.status === "ok"
                ? `${money(answer.shares ?? 0)} אם צדקת`
                : answer.status === "held"
                  ? "אפשר עוד לבטל"
                  : answer.status === "guest"
                    ? "נשמר · ייכנס לניקוד אחרי התחברות"
                    : "נשלח…"}
            </p>
          )}
        </div>
      )}

      {/* Everything the card carries has to fit one screen: the question, its past and
          the two answers. The meta row, the question and the price bar take exactly what
          they need, and the chart takes whatever is left over — down to a floor it stays
          readable at, below which the body scrolls rather than squeezing the curve flat. */}
      <div className="scrollbar-none flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3.5 short:gap-2 short:p-3 sm:gap-3 sm:p-5">
        <div className="flex shrink-0 flex-wrap items-center gap-2 text-[13px] text-muted">
          {previously && (
            <span
              className={`rounded-md px-1.5 py-0.5 font-semibold ${previously === "YES" ? "bg-yes/15 text-yes" : "bg-no/15 text-no"}`}
            >
              ענית {previously === "YES" ? "כן" : "לא"} · אפשר לשנות
            </span>
          )}
          <span
            className="cat-chip rounded-md px-1.5 py-0.5 font-semibold"
            style={{ "--cat": card.categoryAccent, "--cat-dark": card.categoryAccentDark } as CSSProperties}
          >
            {card.categoryLabel}
          </span>
          <span>{closesLabel(card.closesAt)}</span>
          {/* The byline is on the question's own page, one tap away through "פרטים".
              At the 13px floor it was the word that tipped this row onto a second
              line, and the line it cost was the subtitle — the card's own context. */}
          {card.byTeam && <span className="hidden text-muted-2 sm:inline">{SITE_TEAM}</span>}
          <Link
            href={`/market/${card.id}`}
            target="_blank"
            className="tap ms-auto inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 hover:text-text-strong"
          >
            פרטים
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <MarketImage
            src={card.image}
            fallback={card.fallbackImage}
            alt={card.personName ?? ""}
            className="h-12 w-12 shrink-0 rounded-2xl border border-border object-cover sm:h-16 sm:w-16"
          />
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold leading-tight text-text-strong sm:text-2xl">{card.title}</h2>
            {/* The subtitle is context, not the question: AGENT.md requires every title to
                stand on its own, so on a short screen it is the line that gives way. */}
            {card.subtitle && (
              <p className="mt-1 line-clamp-2 text-xs text-muted short:hidden sm:text-sm">{card.subtitle}</p>
            )}
          </div>
        </div>

        {card.spark ? (
          <RapidSpark spark={card.spark} tradeCount={card.tradeCount} />
        ) : (
          /* a market with no drawable past keeps the question centred, as before */
          <div className="min-h-0 flex-1" aria-hidden />
        )}

        <div className="shrink-0 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="tabular font-semibold text-yes">כן {pct(card.probability)}</span>
            <span className="text-muted-2">מד הביטחון כרגע</span>
            <span className="tabular font-semibold text-no">לא {pct(1 - card.probability)}</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className="bg-yes" style={{ width: `${card.probability * 100}%` }} />
            <div className="flex-1 bg-no" />
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-border p-2.5 short:p-2 sm:p-4">
        <div className="grid grid-cols-2 gap-2">
          <AnswerButton
            side="YES"
            stake={stake}
            price={card.probability}
            payout={payouts.YES}
            disabled={done || locked}
            chosen={previously === "YES"}
            hint={showKeys ? "→" : undefined}
            onClick={() => onAnswer("YES")}
          />
          <AnswerButton
            side="NO"
            stake={stake}
            price={1 - card.probability}
            payout={payouts.NO}
            disabled={done || locked}
            chosen={previously === "NO"}
            hint={showKeys ? "←" : undefined}
            onClick={() => onAnswer("NO")}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[13px] text-muted-2 sm:mt-2">
          <button
            onClick={onSkip}
            data-evt="rapid-skip"
            data-evt-market={card.id}
            className="tap inline-flex min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-md px-3 font-semibold hover:text-text-strong"
          >
            דלג
          </button>
          <span className="line-clamp-2 text-end">
            {outOfMoney
              ? "נגמרו הנקודות — אפשר להחזיר תשובות בדף השאלה"
              : locked
                ? "אין מספיק נקודות לסכום הזה"
                : loggedIn
                  ? "הסכום מחייב · מספר התשובות משוער"
                  : "התשובות נשמרות · ההתחברות מכניסה אותן לניקוד"}
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
  chosen,
  hint,
  onClick,
}: {
  side: Side;
  stake: number;
  price: number;
  payout: number;
  disabled: boolean;
  /** this browser's standing answer on the question — the card is being revisited */
  chosen?: boolean;
  hint?: string;
  onClick: () => void;
}) {
  const yes = side === "YES";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={`${yes ? "כן" : "לא"} ב־${stake} נקודות`}
      aria-pressed={chosen || undefined}
      className={`cursor-pointer rounded-2xl py-2.5 text-center text-white transition disabled:cursor-not-allowed disabled:opacity-40 sm:py-3 ${
        yes ? "bg-yes hover:bg-yes-2" : "bg-no hover:bg-no-2"
      } ${chosen ? "ring-2 ring-text-strong ring-offset-2 ring-offset-surface" : ""}`}
    >
      <span className="flex items-center justify-center gap-2 text-xl font-black leading-none sm:text-2xl">
        {hint && (
          <span className="text-sm font-bold opacity-60" aria-hidden>
            {hint}
          </span>
        )}
        {yes ? "כן" : "לא"}
        {/* the meter, not a second price in points: "כן 0.21 נק׳" made the button
            speak a third language beside the gauge above it and the payout below */}
        <span className="tabular text-[15px] font-bold opacity-80">{pct(price)}</span>
      </span>
      <span className="tabular mt-1 block text-[13px] font-semibold opacity-90">
        {money(stake)} ← ≈{money(payout)} אם צדקת
      </span>
    </button>
  );
}

/* ------------------------------------------------------------ stake bar -- */

function StakeBar({
  stake,
  onStake,
  available,
  broke,
  outOfMoney,
  showKeys,
  dimmed,
}: {
  stake: number;
  /** the deck's own setter — it knows whether the choice goes to the account or to the browser */
  onStake: (v: number) => void;
  available: number | null;
  broke: boolean;
  outOfMoney: boolean;
  showKeys: boolean;
  dimmed: boolean;
}) {
  return (
    // Under the deck on a phone the panel is a strip, and every row it takes is a row the
    // card loses — so the label, the amount and the slider share one line there. From lg it
    // has a column to itself and goes back to stacking.
    <div className={`card shrink-0 p-2.5 transition-opacity lg:p-3 ${dimmed ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-3 lg:block">
        <div className="flex shrink-0 items-baseline justify-between gap-2 lg:w-full">
          <label htmlFor="rapid-stake" className="text-[13px] font-semibold text-text lg:text-xs">
            סכום מחייב לכל תשובה
          </label>
          <span className="tabular text-xl font-black text-text-strong lg:text-2xl">{money(stake)}</span>
        </div>
        <input
          id="rapid-stake"
          type="range"
          min={RAPID_MIN_STAKE}
          max={RAPID_MAX_STAKE}
          step={1}
          value={stake}
          onChange={(e) => onStake(Number(e.target.value))}
          className="slider min-w-0 flex-1 lg:mt-1 lg:w-full"
          aria-describedby="rapid-stake-range"
        />
      </div>
      {/* the presets and the range note share a line while there is width for it, and
          wrap onto two in the narrow lg column */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 lg:mt-2">
        {/* on a short screen the slider carries the whole range on its own */}
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto short:hidden">
          {RAPID_STAKE_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => onStake(p)}
              className={`tabular tap shrink-0 rounded-lg border px-3 text-xs font-bold transition ${
                stake === p
                  ? "border-accent bg-accent/15 text-accent-2"
                  : "border-border bg-surface-2 text-muted hover:text-text-strong"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        {/* One line on the phone strip, where it has room for one fact only — how far the
            balance stretches, the fact the slider itself does not already carry. In the lg
            column it takes a line of its own and says everything. */}
        <p id="rapid-stake-range" className="tabular min-w-0 flex-1 truncate text-[13px] text-muted-2 lg:basis-full">
          <span className="hidden lg:inline">
            טווח {RAPID_MIN_STAKE}–{RAPID_MAX_STAKE} נקודות · יורד מהניקוד מיד{available != null ? " · " : ""}
          </span>
          {available != null && (
            <>
              {/* the deck's balance chip is hidden on a short screen — this is where it lands */}
              <span className={`hidden short:inline ${outOfMoney ? "text-no" : "text-yes"}`}>
                נותרו {money(Math.max(0, available))}
                {" · "}
              </span>
              <span className={broke ? "text-no" : ""}>
                {outOfMoney ? "נגמרו הנקודות" : `מספיק ל־${Math.max(0, Math.floor(available / stake))} תשובות`}
              </span>
            </>
          )}
        </p>
      </div>
      {showKeys && (
        <p className="mt-2 border-t border-border pt-2 text-[13px] text-muted-2">
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
              {failed} תשובות לא נקלטו{firstError ? ` (${firstError})` : ""}. אפשר לנסות אותן שוב בעמוד השאלה.
            </p>
          )}
        </>
      ) : (
        <p className="max-w-sm text-muted">גללו למעלה כדי לחזור לשאלות, או עברו לרשימת השאלות המלאה.</p>
      )}
      {/*
        The end of a run is the cheapest place on the site to get another one: the
        deck has just been refreshed with the questions this run did not cover (see
        the router.refresh() above), so "עוד סבב" is a full deck and not a replay.
        It is therefore the primary button — the score can wait until the player
        stops answering, not the other way round.
      */}
      {showActions && (
        <div className="flex flex-wrap justify-center gap-2">
          <button onClick={onRestart} className="pressable inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 font-bold text-white hover:bg-accent-2">
            <BoltIcon size={16} />
            עוד סבב זריז
          </button>
          <Link href="/portfolio" className="rounded-xl border border-border-2 px-5 py-2.5 font-semibold hover:bg-surface-2">
            לניקוד שלי
          </Link>
          <Link href="/" className="rounded-xl border border-border-2 px-5 py-2.5 font-semibold hover:bg-surface-2">
            לכל השאלות
          </Link>
        </div>
      )}
    </div>
  );
}
