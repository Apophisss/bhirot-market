"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { money, pct } from "@/lib/format";
import { quoteBuy, type MarketState, type Side } from "@/lib/lmsr";
import { RAPID_DEFAULT_STAKE } from "@/lib/rapid";
import { savePendingAnswer } from "@/lib/pending-answer";
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
}

/** long enough to read what just happened, short enough that it does not feel like a wait */
const HANDOFF_MS = 900;

/**
 * The three questions on the landing page, answerable before there is an account.
 *
 * They used to be a screenshot: real markets, real prices, and no way to touch them —
 * the only button on the page asked a stranger to connect a Google account before a
 * single price had moved for them. Now the first thing a visitor does is answer, and
 * the sign-in that follows is asked in order to *keep* that answer: `savePendingAnswer`
 * puts it in sessionStorage and `<RapidDeck>` executes it on the way back (see
 * `src/lib/pending-answer.ts`). Same click, very different request.
 *
 * The stake is the deck's default rather than a choice: a stranger has no opinion yet
 * about how much of the play money to commit, and being asked would be one more screen.
 */
export function WelcomeQuestions({ questions }: { questions: WelcomeQuestion[] }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<{ id: string; side: Side } | null>(null);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function choose(q: WelcomeQuestion, side: Side) {
    if (chosen) return; // the trip to login is already under way
    setChosen({ id: q.id, side });
    savePendingAnswer({ marketId: q.id, side, stake: RAPID_DEFAULT_STAKE, title: q.title });
    gaEvent("welcome_answer", { market_id: q.id, side, stake: RAPID_DEFAULT_STAKE });
    if (typeof navigator.vibrate === "function") navigator.vibrate(12);
    // the confirmation is the point of the pause: it is the first time the visitor sees
    // that answering does something, and it is what the login is now asking to preserve
    timer.current = window.setTimeout(() => router.push("/login?callbackUrl=%2Frapid"), HANDOFF_MS);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {questions.map((q) => (
        <QuestionCard
          key={q.id}
          q={q}
          side={chosen?.id === q.id ? chosen.side : null}
          dimmed={Boolean(chosen) && chosen?.id !== q.id}
          onAnswer={(side) => choose(q, side)}
        />
      ))}
    </div>
  );
}

function QuestionCard({
  q,
  side,
  dimmed,
  onAnswer,
}: {
  q: WelcomeQuestion;
  side: Side | null;
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
            className="inline-block rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
            style={{ background: `${q.categoryAccent}22`, color: q.categoryAccent }}
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
          <p className="tabular mt-0.5 text-[12px] font-semibold text-text">
            {money(RAPID_DEFAULT_STAKE)} ← ≈{money(payout)} אם צדקתם
          </p>
          <p className="mt-1 text-[11px] text-muted">שומרים לכם את התשובה…</p>
        </div>
      ) : (
        <div className="mt-auto grid grid-cols-2 gap-2">
          <button
            onClick={() => onAnswer("YES")}
            data-evt="welcome-answer-yes"
            data-evt-market={q.id}
            className="tap pressable flex cursor-pointer items-center justify-center rounded-lg bg-yes/15 text-sm font-bold text-yes transition hover:bg-yes hover:text-white"
          >
            כן {pct(q.probability)}
          </button>
          <button
            onClick={() => onAnswer("NO")}
            data-evt="welcome-answer-no"
            data-evt-market={q.id}
            className="tap pressable flex cursor-pointer items-center justify-center rounded-lg bg-no/15 text-sm font-bold text-no transition hover:bg-no hover:text-white"
          >
            לא {pct(1 - q.probability)}
          </button>
        </div>
      )}
    </article>
  );
}
