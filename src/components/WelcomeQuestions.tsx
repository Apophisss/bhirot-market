"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { closesLabel, money, pct } from "@/lib/format";
import { quoteBuy, type MarketState, type Side } from "@/lib/lmsr";
import { RAPID_DEFAULT_STAKE } from "@/lib/rapid";
import {
  addGuestAnswer,
  guestAnswerFor,
  guestGateReached,
  readGuestAnswers,
  serverGuestAnswers,
  subscribeGuestAnswers,
} from "@/lib/rapid-guest";
import { track } from "@/lib/track";
import { EVENTS } from "@/lib/events";
import { MarketImage } from "./MarketImage";

/** One real, currently open question, in the shape the landing page can hand across the RSC boundary. */
export interface WelcomeQuestion {
  id: string;
  title: string;
  probability: number;
  qYes: number;
  qNo: number;
  liquidity: number;
  image: string;
  fallbackImage: string;
  personName: string | null;
  categoryLabel: string;
  categoryAccent: string;
  categoryAccentDark: string;
  /** epoch ms — carried into the saved answer so the sign-in screens can say when it is decided */
  closesAt: number;
}

/** long enough to read what just happened, short enough that it does not feel like a wait */
const HANDOFF_MS = 900;

/**
 * One handoff per page, whichever instance started it.
 *
 * The page renders the cards as two instances — one in the hero, two under it — and
 * each owns its `chosen` state. Without a shared flag a second tap on a grid card
 * during the 900ms window would save a second answer, fire a second event and push
 * to the deck twice. Module-level on purpose: it is per page load, not per instance,
 * and the unmount effect below clears it so a client-side return to /welcome starts
 * clean.
 */
let handoffStarted = false;

/**
 * The three questions on the landing page, answerable before there is an account.
 *
 * They used to be a screenshot: real markets, real prices, and no way to touch them —
 * the only button on the page asked a stranger to connect a Google account before a
 * single price had moved for them. The deck already lets a visitor answer without one
 * (`src/lib/rapid-guest.ts`), and this is the same mechanic one screen earlier: the
 * answer goes into the same store, and `<RapidGuestSync>` turns it into a real position
 * on the way back from Google. The sign-in that follows is asked in order to *keep*
 * that answer — the same click, for a very different reason.
 *
 * Where the first answer *leads* is the deck, not the sign-in screen. One tap used to
 * hand the visitor straight to `/login`, which made the free run exactly one question
 * long on the one page built to prove that answering is easy — the wall arrived before
 * the second question did. The run is `GUEST_LIMIT` questions and it starts here: the
 * card that was answered hands over to `/rapid`, where the rest of it is, and only the
 * answer that actually reaches the limit goes to `/login`.
 *
 * The stake is the deck's default rather than a choice: a stranger has no opinion yet
 * about how much of the play money to commit, and being asked would be one more screen.
 */
/**
 * `hero` is the one card that sits inside the dark band at the top of the page — the
 * ad's own picture, live: bigger type, the closing time (the reason the answer is worth
 * keeping), and the confidence bar. `grid` is the cards under it, as before. Two
 * instances share nothing but the browser store, which is all they need to agree on
 * which questions this visitor already answered.
 */
export function WelcomeQuestions({ questions, variant = "grid" }: { questions: WelcomeQuestion[]; variant?: "grid" | "hero" }) {
  const router = useRouter();
  const saved = useSyncExternalStore(subscribeGuestAnswers, readGuestAnswers, serverGuestAnswers);
  const [chosen, setChosen] = useState<{ id: string; side: Side } | null>(null);
  const timer = useRef(0);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      handoffStarted = false;
    },
    [],
  );

  const choose = useCallback(
    (q: WelcomeQuestion, side: Side) => {
      if (chosen || handoffStarted) return; // the handoff to the deck (or to the gate) is already under way
      handoffStarted = true;
      setChosen({ id: q.id, side });
      // Always written, including the answer that goes past the free run: the store
      // keeps one more than the limit precisely so the tap that raises the wall is
      // not the one that gets thrown away (see GUEST_STORE_LIMIT), and the sign-in
      // screen lists it with the rest.
      addGuestAnswer({
        marketSlug: q.id,
        side,
        priceAtAnswer: side === "YES" ? q.probability : 1 - q.probability,
        title: q.title,
        // the landing page never asks for an amount, so it records the one it showed
        stake: RAPID_DEFAULT_STAKE,
        closesAt: q.closesAt,
        ts: Date.now(),
      });
      // The one first-party record that a paid visitor did anything at all. It used to
      // go to GA4 alone (as "welcome_answer"), which left the site's own funnel blind to
      // the landing page's only interaction; `track()` reaches both logs.
      track(EVENTS.guestAnswer, {
        marketId: q.id,
        props: { surface: "welcome", side, stored: readGuestAnswers().length },
      });
      if (typeof navigator.vibrate === "function") navigator.vibrate(12);
      // Where to next, read back from the store rather than from this component's state:
      // the browser may already be carrying answers from an earlier visit or from the
      // deck, and it is the total that decides whether there is any free run left.
      const next = guestGateReached(readGuestAnswers()) ? "/login?callbackUrl=%2Frapid" : "/rapid";
      // the confirmation is the point of the pause: it is the first time the visitor sees
      // that answering does something, and it is what the rest of the run is built on
      timer.current = window.setTimeout(() => router.push(next), HANDOFF_MS);
    },
    [chosen, router],
  );

  return (
    <div className={variant === "hero" ? "" : "grid gap-3 sm:grid-cols-2"}>
      {questions.map((q) => {
        // an answer this browser already gave — on an earlier visit, or in the deck —
        // is shown back rather than asked again: the card and the store never disagree
        const stored = guestAnswerFor(saved, q.id);
        return (
          <QuestionCard
            key={q.id}
            q={q}
            hero={variant === "hero"}
            side={chosen?.id === q.id ? chosen.side : stored?.side ?? null}
            handingOff={chosen?.id === q.id}
            dimmed={Boolean(chosen) && chosen?.id !== q.id}
            onAnswer={(side) => choose(q, side)}
          />
        );
      })}
    </div>
  );
}

function QuestionCard({
  q,
  hero = false,
  side,
  handingOff,
  dimmed,
  onAnswer,
}: {
  q: WelcomeQuestion;
  /** the card in the hero band: larger, with the closing time and the confidence bar */
  hero?: boolean;
  side: Side | null;
  /** true only for the card just tapped — the one the handoff is waiting on */
  handingOff: boolean;
  dimmed: boolean;
  onAnswer: (side: Side) => void;
}) {
  const state: MarketState = { qYes: q.qYes, qNo: q.qNo, b: q.liquidity };
  // what each answer would actually be worth — the real market maker, not an illustration
  const payouts = {
    YES: quoteBuy(state, "YES", RAPID_DEFAULT_STAKE).payout,
    NO: quoteBuy(state, "NO", RAPID_DEFAULT_STAKE).payout,
  };
  const payout = side ? payouts[side] : 0;
  // the share of the board's confidence that sits on the side the visitor picked
  const crowd = side ? (side === "YES" ? q.probability : 1 - q.probability) : 0;

  return (
    <article
      className={`card flex flex-col transition-opacity ${
        // The hero card keeps the ad's look in both themes: a white card on the dark
        // band. `.card` follows the theme tokens, and in dark mode that is a
        // near-black card on a near-black gradient — the picture the visitor
        // clicked on exists only in light mode unless the card is pinned.
        hero ? "welcome-hero-card gap-3.5 p-4 shadow-lg shadow-ink/25 sm:p-5" : "gap-3 p-3.5 sm:p-4"
      } ${dimmed ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-2.5">
        <MarketImage
          src={q.image}
          fallback={q.fallbackImage}
          alt={q.personName ?? ""}
          className={`shrink-0 rounded-full border border-border object-cover object-top ${hero ? "h-14 w-14" : "h-11 w-11"}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
            <span
              className="cat-chip inline-block rounded-md px-1.5 py-0.5 font-semibold"
              style={{ "--cat": q.categoryAccent, "--cat-dark": q.categoryAccentDark } as CSSProperties}
            >
              {q.categoryLabel}
            </span>
            {/* when the visitor would find out — the one promise a prediction game can
                make that a quiz cannot. "מוכרע", not the board's "נסגר": a stranger has no
                market to picture closing. Relative to "now", so the server's text is kept
                rather than fought over at hydration (see RapidDeck for the same span). */}
            {hero && <span suppressHydrationWarning>{closesLabel(q.closesAt).replace(/^נסגר/, "מוכרע")}</span>}
          </div>
          <h3 className={`mt-1 font-bold leading-snug text-text-strong ${hero ? "line-clamp-4 text-lg sm:text-xl" : "line-clamp-3 text-[15px] font-semibold"}`}>
            {q.title}
          </h3>
        </div>
      </div>

      {hero && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="tabular font-semibold text-yes">כן {pct(q.probability)}</span>
            <span className="text-muted-2">מד הביטחון של השחקנים</span>
            <span className="tabular font-semibold text-no">לא {pct(1 - q.probability)}</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className="bg-yes" style={{ width: `${q.probability * 100}%` }} />
            <div className="flex-1 bg-no" />
          </div>
        </div>
      )}

      {side ? (
        <div
          className={`mt-auto rounded-xl px-3 py-2.5 text-center ${side === "YES" ? "bg-yes/15 text-yes" : "bg-no/15 text-no"}`}
        >
          <p className="text-sm font-black">עניתם {side === "YES" ? "כן" : "לא"}</p>
          {/* the first feedback the visitor ever gets from the site: where they stand
              against the board, and what being right would pay */}
          <p className="tabular mt-0.5 text-[13px] font-semibold text-text">
            המד בצד שלכם: {pct(crowd)} · {money(RAPID_DEFAULT_STAKE)} הופכות ל־≈{money(payout)} אם צדקתם
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {handingOff ? "נשמר · השאלה הבאה עולה…" : "התשובה שמורה · אפשר להמשיך לעוד שאלות, בלי חשבון"}
          </p>
        </div>
      ) : (
        <div className="mt-auto grid grid-cols-2 gap-2">
          {/* On the hero card the percentages live on the bar just above, so the buttons
              say what the tap yields instead — the deck's own format. The grid cards
              have no bar, and keep the percentage beside the word. */}
          <button
            onClick={() => onAnswer("YES")}
            data-evt="welcome-answer-yes"
            data-evt-market={q.id}
            className={`tap pressable flex cursor-pointer flex-col items-center justify-center font-black transition ${
              hero
                ? "rounded-xl bg-yes py-2.5 text-white hover:bg-yes-2"
                : "rounded-lg bg-yes/15 text-sm font-bold text-yes hover:bg-yes hover:text-white active:bg-yes active:text-white"
            }`}
          >
            {hero ? (
              <>
                <span className="text-xl leading-none">כן</span>
                <span className="tabular mt-1 text-[13px] font-semibold opacity-90">≈{money(payouts.YES)} אם צדקתם</span>
              </>
            ) : (
              <span>
                כן <span className="tabular">{pct(q.probability)}</span>
              </span>
            )}
          </button>
          <button
            onClick={() => onAnswer("NO")}
            data-evt="welcome-answer-no"
            data-evt-market={q.id}
            className={`tap pressable flex cursor-pointer flex-col items-center justify-center font-black transition ${
              hero
                ? "rounded-xl bg-no py-2.5 text-white hover:bg-no-2"
                : "rounded-lg bg-no/15 text-sm font-bold text-no hover:bg-no hover:text-white active:bg-no active:text-white"
            }`}
          >
            {hero ? (
              <>
                <span className="text-xl leading-none">לא</span>
                <span className="tabular mt-1 text-[13px] font-semibold opacity-90">≈{money(payouts.NO)} אם צדקתם</span>
              </>
            ) : (
              <span>
                לא <span className="tabular">{pct(1 - q.probability)}</span>
              </span>
            )}
          </button>
        </div>
      )}
    </article>
  );
}
