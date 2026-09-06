/**
 * Checks the free run — the questions a visitor may answer before the site asks
 * for an account (src/lib/rapid-guest.ts).
 *
 * The number itself is a product decision (ten, up from four), but three things
 * around it are promises the screens make out loud, and this is what holds them:
 *
 *   1. the run really is `GUEST_LIMIT` questions long — the wall goes up on the
 *      answer after it, not before;
 *   2. changing your mind is not one of your ten — re-answering a question the
 *      browser already holds updates it and costs nothing;
 *   3. the answer that hits the wall is kept, because the sign-in screen lists it
 *      and promises to claim it (see GUEST_STORE_LIMIT).
 *
 * And the countdown the deck banner prints (`guestAnswersLeft`) never goes
 * negative, including for the browser holding that extra answer.
 *
 * The store reads `window.localStorage` at call time, so a plain object standing
 * in for `window` is enough to exercise it exactly as the deck does.
 *
 *   npm run test:guest
 *
 * Exits 1 on the first violations and prints the failing cases.
 */
import {
  GUEST_LIMIT,
  GUEST_RECAP_LIMIT,
  GUEST_STORE_LIMIT,
  addGuestAnswer,
  clearGuestAnswers,
  guestAnswerFor,
  guestAnswersLeft,
  guestGateReached,
  readGuestAnswers,
  resetGuestCache,
  serverGuestAnswers,
  type GuestAnswer,
} from "../src/lib/rapid-guest";

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) return;
  failures++;
  console.error(`✗ ${name}`, detail === undefined ? "" : JSON.stringify(detail));
  if (failures > 10) {
    console.error("aborting after 10 failures");
    process.exit(1);
  }
}

/** a localStorage that behaves, standing in for a browser's */
function installStore(): Map<string, string> {
  const mem = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    },
  };
  resetGuestCache();
  return mem;
}

let n = 0;
function answer(slug: string, side: "YES" | "NO" = "YES"): GuestAnswer {
  n++;
  return { marketSlug: slug, side, priceAtAnswer: 0.5, title: `שאלה ${slug}`, stake: 20, ts: n };
}

/* ------------------------------------------------------------ the numbers -- */

check("the free run is ten questions", GUEST_LIMIT === 10, GUEST_LIMIT);
check("the browser holds the run plus the answer that ended it", GUEST_STORE_LIMIT === GUEST_LIMIT + 1);
check(
  "a recap is shorter than the run, so the gate always has a button on screen",
  GUEST_RECAP_LIMIT > 0 && GUEST_RECAP_LIMIT < GUEST_LIMIT,
  { GUEST_RECAP_LIMIT, GUEST_LIMIT },
);

/* ------------------------------------------------------------- a full run -- */

const mem = installStore();

check("a fresh browser is not at the wall", !guestGateReached(readGuestAnswers()));
check("and has the whole run in front of it", guestAnswersLeft(readGuestAnswers()) === GUEST_LIMIT);

for (let i = 1; i <= GUEST_LIMIT; i++) {
  addGuestAnswer(answer(`q${i}`));
  const left = guestAnswersLeft(readGuestAnswers());
  check(`answer ${i} of ${GUEST_LIMIT} leaves ${GUEST_LIMIT - i}`, left === GUEST_LIMIT - i, left);
  const wall = guestGateReached(readGuestAnswers());
  check(`the wall is ${i < GUEST_LIMIT ? "still down" : "up"} after answer ${i}`, wall === (i >= GUEST_LIMIT), wall);
}

resetGuestCache();
check("the whole run survives a reload", readGuestAnswers().length === GUEST_LIMIT);
check("and it is the same run", readGuestAnswers()[0]?.marketSlug === "q1");

/* --------------------------------------------------- changing one's mind --- */

addGuestAnswer(answer("q3", "NO"));
check("re-answering replaces the side", guestAnswerFor(readGuestAnswers(), "q3")?.side === "NO");
check("and does not lengthen the run", readGuestAnswers().length === GUEST_LIMIT);
check("so the countdown does not move", guestAnswersLeft(readGuestAnswers()) === 0);

/* ------------------------------------------------ the answer past the wall -- */

addGuestAnswer(answer("q11"));
check("the answer that hit the wall is kept", readGuestAnswers().length === GUEST_STORE_LIMIT);
check("and it is the one that was given", guestAnswerFor(readGuestAnswers(), "q11") !== null);
check("the countdown never goes negative", guestAnswersLeft(readGuestAnswers()) === 0);

addGuestAnswer(answer("q12"));
check("nothing is taken after that", readGuestAnswers().length === GUEST_STORE_LIMIT);
check("and the extra answer is not in the store", guestAnswerFor(readGuestAnswers(), "q12") === null);

check("what is on disk is what is in memory", (() => {
  const raw = mem.get("bhirot:rapid:guest");
  return Boolean(raw) && (JSON.parse(raw as string) as GuestAnswer[]).length === GUEST_STORE_LIMIT;
})());

/* ---------------------------------------------------------- claiming them -- */

clearGuestAnswers();
check("claiming the answers empties the store", readGuestAnswers().length === 0);
check("the run starts over from nothing", guestAnswersLeft(readGuestAnswers()) === GUEST_LIMIT);
check("and nothing is left on disk", !mem.has("bhirot:rapid:guest"));

/* ------------------------------------------------------- a blocked store --- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window = {
  localStorage: {
    getItem() {
      throw new Error("private mode");
    },
    setItem() {
      throw new Error("private mode");
    },
    removeItem() {
      throw new Error("private mode");
    },
  },
};
resetGuestCache();
check("a blocked store reads as 'answered nothing'", readGuestAnswers().length === 0);
addGuestAnswer(answer("p1"));
check("and answering in private mode does not throw", readGuestAnswers().length === 1);
check("the run still counts down for this visit", guestAnswersLeft(readGuestAnswers()) === GUEST_LIMIT - 1);

check("the server never claims answers it cannot know about", serverGuestAnswers().length === 0);

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log(`✓ rapid guest: ${GUEST_LIMIT} questions before the wall, and the answer that hits it is kept`);
