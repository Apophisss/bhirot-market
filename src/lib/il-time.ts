/**
 * Israel wall-clock helpers.
 *
 * Every deadline on the site is written in Israel time ("נסגר ב-20:59"), while a
 * `<input type="datetime-local">` hands the server a naive string and the server
 * itself runs in UTC. Israel switches between UTC+2 and UTC+3, so the offset has
 * to come from the timezone database rather than from a constant.
 */

const TZ = "Asia/Jerusalem";

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Minutes Israel is ahead of UTC at the given instant (120 or 180). */
export function israelOffsetMinutes(at: Date): number {
  const p = Object.fromEntries(partsFmt.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    // Intl renders midnight as "24" in some ICU versions
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * Reads "2026-09-20T20:59" (or "…:59:59") as Israel wall-clock time and returns the
 * matching UTC ISO string. Anything that already carries a zone is returned as-is.
 * Returns null when the value is not a date at all.
 */
export function israelLocalToIso(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const naive = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(v);
  if (!naive) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const [y, mo, da, hh, mm] = naive.slice(1, 6).map(Number);
  const ss = naive[6] ? Number(naive[6]) : 0;
  // Date.UTC happily rolls "2026-13-45T99:99" over into next year, which would turn a
  // typo into a valid deadline months away — so the fields are range-checked first
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || hh > 23 || mm > 59 || ss > 59) return null;
  const asIfUtc = Date.UTC(y, mo - 1, da, hh, mm, ss);
  // one correction pass is enough: the guess is at most an hour off, and only a DST
  // switch inside that hour could move the offset again
  let ts = asIfUtc - israelOffsetMinutes(new Date(asIfUtc)) * 60_000;
  ts = asIfUtc - israelOffsetMinutes(new Date(ts)) * 60_000;
  const iso = new Date(ts).toISOString();
  // a day that does not exist (31.9) or a wall-clock hour the DST jump skips comes back
  // as a different local time than the one asked for
  const pad = (n: number) => String(n).padStart(2, "0");
  if (isoToIsraelLocal(iso) !== `${pad(y)}-${pad(mo)}-${pad(da)}T${pad(hh)}:${pad(mm)}`) return null;
  return iso;
}

const localFmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TZ,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** The inverse: an instant as the "YYYY-MM-DDTHH:mm" a datetime-local input wants. */
export function isoToIsraelLocal(value: Date | number | string): string {
  return localFmt.format(new Date(value)).replace(" ", "T");
}
