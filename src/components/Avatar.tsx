import { hashSeed, letterFor } from "@/lib/letter-avatar";

/** deterministic hue for a seed string; well spread even for consecutive ids */
function hueFor(seed: string): number {
  return hashSeed(seed) % 360;
}

/**
 * A round badge holding one or two capitals on a colored disc — the same
 * circle the app uses for a signed-in user, for a leaderboard row and for a row
 * in the activity feed.
 */
export function LetterAvatar({
  letters,
  seed,
  size = 32,
}: {
  letters: string;
  /** picks the disc color; two people sharing an initial get different discs */
  seed?: string;
  size?: number;
}) {
  const hue = hueFor(seed ?? letters);
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      /*
        The lightness is 30%, not the 45% it was: the letter is white, and at 45%
        the worst hue (yellow, around 60deg) gave it 2.1:1 — the initials on a
        leaderboard row were the least readable text on the page. At 30% the
        worst hue is 4.53:1, so every disc the generator can produce clears AA.
      */
      style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${hue} 60% 30%)` }}
      aria-hidden
    >
      {letters}
    </span>
  );
}

/**
 * A user's avatar: their picture, else the initials of their name, else one
 * capital drawn from `letterFor`. A name-less account (the "אנונימי" rows on the
 * leaderboard) gets a letter circle like everybody else instead of a "?" that
 * reads as a broken row; that letter is decoration seeded by the id the caller
 * passes — stable for that account, but not the person's initial.
 */
export function Avatar({
  name,
  image,
  size = 32,
  seed,
}: {
  name?: string | null;
  image?: string | null;
  size?: number;
  /** stable id for the fallback letter (a user id), so it never reshuffles */
  seed?: string;
}) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={name ?? ""} width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} referrerPolicy="no-referrer" />;
  }
  const initials = (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  if (initials) return <LetterAvatar letters={initials} seed={name ?? initials} size={size} />;
  const fallbackSeed = seed ?? "anon";
  return <LetterAvatar letters={letterFor(fallbackSeed)} seed={fallbackSeed} size={size} />;
}
