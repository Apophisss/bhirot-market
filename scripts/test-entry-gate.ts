/**
 * Checks the entry gate — the "מצב זריז" offer that opens a visit
 * (src/lib/entry-gate.ts).
 *
 * Two promises hold the whole thing up:
 *
 *   1. it opens *every* entry to the site, for a signed-in visitor and a stranger
 *      alike, on any page they happen to land on — and never on the handful of
 *      screens where a modal is actively harmful: the deck itself, the sign-in
 *      flow, an invite someone was sent;
 *   2. it is once per visit, not once per click. A visitor who dismissed it and
 *      then opened three questions must not meet it three more times.
 *
 * The path test is segment-aware on purpose: `/l` is a league page and
 * `/leaderboard` is not, and a plain `startsWith` silences the gate on a page it
 * belongs on.
 *
 * `sessionStorage` is read at call time, so a plain object standing in for
 * `window` exercises the memory exactly as the browser does — including the
 * private-browsing case, where the store throws on every call.
 *
 *   npm run test:gate
 *
 * Exits 1 on the first violations and prints the failing cases.
 */
import { GATE_SKIP_PATHS, gateOffered, markGateOffered, pathWantsGate, resetGateOffered } from "../src/lib/entry-gate";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) {
    failures++;
    console.error(`✗ ${name}\n    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    console.log(`✓ ${name}`);
  }
}

/** A `window` with a working session store, like any ordinary browser. */
function installStore() {
  const map = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    sessionStorage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    },
  };
  return map;
}

/** Private browsing: the store exists and throws on every touch. */
function installBrokenStore() {
  const boom = () => {
    throw new Error("storage is disabled");
  };
  (globalThis as { window?: unknown }).window = {
    sessionStorage: { getItem: boom, setItem: boom, removeItem: boom },
  };
}

/* ------------------------------------------------------------ which pages -- */

// the pages a visitor actually lands on, in and out of an account
for (const path of ["/", "/market/netanyahu-testifies", "/category/polls", "/leaderboard", "/activity", "/portfolio", "/about", "/invite", "/leagues/abc"]) {
  check(`שער בכניסה ל-${path}`, pathWantsGate(path), true);
}

// and the ones where a window on top of the screen is the wrong thing to do
for (const path of [...GATE_SKIP_PATHS, "/rapid?category=polls", "/login/", "/i/AB12CD", "/l/xyz", "/admin/markets", "/api/analytics/collect"]) {
  check(`בלי שער ב-${path}`, pathWantsGate(path), false);
}

// `/l` is a league link and `/leaderboard` is not: the skip list is segments, not text
check("‎/leaderboard אינו ‎/l", pathWantsGate("/leaderboard"), true);
check("‎/invite אינו ‎/i", pathWantsGate("/invite"), true);
check("‎/rapid-old אינו ‎/rapid", pathWantsGate("/rapid-old"), true);
check("סלאש בסוף לא משנה", pathWantsGate("/market/x/"), true);
check("כתובת שאינה נתיב", pathWantsGate("https://example.com/"), false);
check("נתיב ריק", pathWantsGate(""), false);

/* ----------------------------------------------------------- once a visit -- */

installStore();
resetGateOffered();
check("ביקור חדש: עוד לא הוצע", gateOffered(), false);
markGateOffered();
check("אחרי ההצגה: לא שוב באותו ביקור", gateOffered(), true);
markGateOffered();
check("סימון חוזר אינו מבטל את עצמו", gateOffered(), true);
resetGateOffered();
check("ביקור הבא מתחיל נקי", gateOffered(), false);

/* --------------------------------------------------- a store that refuses -- */

installBrokenStore();
check("גלישה פרטית: אין זיכרון, ולכן ההצעה עדיין מוצגת", gateOffered(), false);
// and none of the writers may throw into the page that called them
markGateOffered();
resetGateOffered();
check("גלישה פרטית: הכתיבה לא מפילה כלום", gateOffered(), false);

if (failures) {
  console.error(`\n${failures} בדיקות נכשלו`);
  process.exit(1);
}
console.log("\nכל הבדיקות עברו");
