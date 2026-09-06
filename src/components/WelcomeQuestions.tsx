"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { money, pct } from "@/lib/format";
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
import { gaEvent } from "@/lib/gtag";
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
}

/** long enough to read what just happened, short enough that it does not feel like a wait */
const HANDOFF_MS = 900;

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
export function WelcomeQuestions({ questions }: { questions: WelcomeQuestion[] }) {
  const router = useRouter();
  const saved = useSyncExternalStore(subscribeGuestAnswers, readGuestAnswers, serverGuestAnswers);
  const [chosen, setChosen] = useState<{ id: string; side: Side } | null>(null);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const choose = useCallback(
    (q: WelcomeQuestion, side: Side) => {
      if (chosen) return; // the handoff to the deck (or to the gate) is already under way
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
        ts: Date.now(),
      });
      gaEvent("welcome_answer", { market_id: q.id, side });
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
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {questions.map((q) => {
        // an answer this browser already gave — on an earlier visit, or in the deck —
        // is shown back rather than asked again: the card and the store never disagree
        const stored = guestAnswerFor(saved, q.id);
        return (
          <QuestionCard
            key={q.id}
            q={q}
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
  side,
  handingOff,
  dimmed,
  onAnswer,
}: {
  q: WelcomeQuestion;
  side: Side | null;
  /** true only for the card just tapped — the one the handoff is waiting on */
  handingOff: boolean;
  dimmed: boolean;
  onAnswer: (side: Side) => void;
}) {
  const state: MarketState = { qYes: q.qYes, qNo: q.qNo, b: q.liquidity };
  // what the answer would actually be worth — the real market maker, not an illustration
  const payout = side ? quoteBuy(state, side, RAPID_DEFAULT_STAKE).payout : 0;

  return (
    <article className={`card flex flex-col gap-3 p-3.5 transition-opacity sm:p-4 ${dimmed ? "opacity-40" : ""}`}>
      <div className="flex items-start gap-2.5">
        <MarketImage
          src={q.image}
          fallback={q.fallbackImage}
          alt={q.personName ?? ""}
          className="h-11 w-11 shrink-0 rounded-full border border-border object-cover object-top"
        />
        <div className="min-w-0 flex-1">
          <span
            className="cat-chip inline-block rounded-md px-1.5 py-0.5 text-[13px] font-semibold"
            style={{ "--cat": q.categoryAccent, "--cat-dark": q.categoryAccentDark } as CSSProperties}
          >
            {q.categoryLabel}
          </span>
          <h3 className="mt-1 line-clamp-3 text-[15px] font-semibold leading-snug text-text-strong">{q.title}</h3>
        </div>
      </div>

      {side ? (
        <div
          className={`mt-auto rounded-xl px-3 py-2.5 text-center ${side === "YES" ? "bg-yes/15 text-yes" : "bg-no/15 text-no"}`}
        >
          <p className="text-sm font-black">ענית {side === "YES" ? "כן" : "לא"}</p>
          <p className="tabular mt-0.5 text-[13px] font-semibold text-text">
            {money(RAPID_DEFAULT_STAKE)} ← ≈{money(payout)} אם צדקתם
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {handingOff ? "שומרים לכם את התשובה…" : "התשובה שמורה · אפשר להמשיך לעוד שאלות, בלי חשבון"}
          </p>
        </div>
      ) : (
        <div className="mt-auto grid grid-cols-2 gap-2">
          <button
            onClick={() => onAnswer("YES")}
            data-evt="welcome-answer-yes"
            data-evt-market={q.id}
            className="tap pressable flex cursor-pointer items-center justify-center rounded-lg bg-yes/15 text-sm font-bold text-yes transition hover:bg-yes hover:text-white active:bg-yes active:text-white"
          >
            כן {pct(q.probability)}
          </button>
          <button
            onClick={() => onAnswer("NO")}
            data-evt="welcome-answer-no"
            data-evt-market={q.id}
            className="tap pressable flex cursor-pointer items-center justify-center rounded-lg bg-no/15 text-sm font-bold text-no transition hover:bg-no hover:text-white active:bg-no active:text-white"
          >
            לא {pct(1 - q.probability)}
          </button>
        </div>
      )}
    </article>
  );
}
