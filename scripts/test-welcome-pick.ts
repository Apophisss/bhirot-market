/**
 * Checks which question the paid landing page opens with (src/lib/welcome-pick.ts):
 * the hero card has to be decided soon, still in play and short; the fallback is
 * the old behaviour; and the cards under it never repeat the hero.
 *
 *   npm run test:welcome
 */
import { WELCOME_SOON_HOURS, isHeroWorthy, pickWelcomeQuestions } from "../src/lib/welcome-pick";

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) return;
  failures++;
  console.error(`✗ ${name}`, detail === undefined ? "" : JSON.stringify(detail));
}

const NOW = 1_800_000_000_000;
const H = 3_600_000;
const q = (id: string, hours: number, p = 0.5, title = `האם ${id}?`) => ({ id, title, probability: p, closesAt: NOW + hours * H });

check("a question closing tomorrow at 40% is hero-worthy", isHeroWorthy(q("a", 20, 0.4), NOW));
check("a question closing in four months is not", !isHeroWorthy(q("b", 24 * 120), NOW));
check("the window is three days", WELCOME_SOON_HOURS === 72 && isHeroWorthy(q("c", 72), NOW) && !isHeroWorthy(q("d", 73), NOW));
check("a question closing within the hour is too late to answer", !isHeroWorthy(q("e", 0.5), NOW));
check("a near-certainty is not in play", !isHeroWorthy(q("f", 20, 0.05), NOW) && !isHeroWorthy(q("g", 20, 0.95), NOW));
check("a title too long for the hero is skipped", !isHeroWorthy(q("h", 20, 0.5, "האם ".padEnd(120, "א")), NOW));

const trending = [q("t1", 24 * 140, 0.36), q("t2", 24 * 140, 0.33), q("t3", 24 * 30, 0.22), q("t4", 24 * 10, 0.5)];
const soon = [q("s0", 0.2, 0.5), q("s1", 30, 0.97), q("s2", 40, 0.3), q("s3", 50, 0.5)];

const picked = pickWelcomeQuestions(soon, trending, { now: NOW, count: 3 });
check("the hero is the first closing-soon question that qualifies", picked.hero?.id === "s2", picked.hero?.id);
check("the rest is trending, two cards", picked.rest.map((m) => m.id).join() === "t1,t2", picked.rest.map((m) => m.id));

const overlap = pickWelcomeQuestions([q("t2", 40, 0.33)], trending, { now: NOW, count: 3 });
check("a hero that is also trending is not shown twice", overlap.hero?.id === "t2" && overlap.rest.map((m) => m.id).join() === "t1,t3", overlap.rest.map((m) => m.id));

const fallback = pickWelcomeQuestions([q("x", 20, 0.99)], trending, { now: NOW, count: 3 });
check("with nothing decided soon, the old behaviour: trending first", fallback.hero?.id === "t1" && fallback.rest.map((m) => m.id).join() === "t2,t3");

const empty = pickWelcomeQuestions([], [], { now: NOW, count: 3 });
check("an empty board gives no hero and no rest", empty.hero === null && empty.rest.length === 0);

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("✓ welcome pick: the hero card is decided within three days, in play, and never repeated below");
