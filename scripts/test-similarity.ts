/**
 * The duplicate screen, checked against the cases it actually has to survive.
 *
 * Every case here is a real pair from data/markets.json or a real rejection the
 * pipeline made, because the failure mode of a similarity metric is not "wrong
 * number" — it is "plausible number that quietly throws away a good question, or
 * quietly lets the same question onto the board twice".
 */
import { similar, ordered, duplicateRisk, DUPLICATE_THRESHOLD, type Comparable } from "../src/lib/similarity";

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const HOUR = 3_600_000;
const at = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * HOUR).toISOString();
const market = (over: Partial<Comparable> & { slug: string; title: string }): Comparable => ({
  resolutionCriteria: "",
  closesAt: at(240),
  sources: [],
  ...over,
});

console.log("similarity — title overlap");
{
  const a = "האם ערוץ 14 יפרסם עד 15.9 סקר שנותן לליכוד 30 מנדטים ומעלה?";
  const b = "האם ערוץ 14 יפרסם עד 15.9 סקר שנותן לליכוד 30 מנדטים ומעלה?";
  check("a title is identical to itself", similar(a, b) === 1, `${similar(a, b)}`);
}
{
  // the poll archetype: one vocabulary, two pollsters, two thresholds
  const a = "האם סקר חדשות 12 של מוצאי שבת ייתן לליכוד 25 מנדטים ומעלה?";
  const b = "האם ערוץ 14 יפרסם עד 15.9 סקר שנותן לליכוד 30 מנדטים ומעלה?";
  check("different pollster and threshold stays under the block bar", similar(a, b) < DUPLICATE_THRESHOLD, `${similar(a, b).toFixed(2)}`);
}
{
  const a = "האם יאיר גולן יגיש תביעת דיבה נגד שרה נתניהו עד 31.12.2026?";
  const b = "האם המשטרה תפתח בחקירה פלילית נגד השר בן גביר עד 30.9?";
  check("unrelated questions score low", similar(a, b) < 0.3, `${similar(a, b).toFixed(2)}`);
}
{
  // Hebrew glues prepositions on: these are one word to a reader
  const a = "האם רשימת הליכוד תוגש ברהט לוועדת הבחירות המרכזית עד 10.9?";
  const b = "האם רשימת הליכוד תוגש רהט לוועדת הבחירות המרכזית עד 10.9?";
  check("prefixes are stripped before comparing", similar(a, b) === 1, `${similar(a, b).toFixed(2)}`);
}
{
  // the same party written two ways: over-stripping used to make "לליכוד" and
  // "מהליכוד" two different words, and two questions about it look unrelated
  const a = "האם תפורסם רשימת המועמדים של הליכוד באתר ועדת הבחירות עד 20.9?";
  const b = "האם תפורסם רשימת המועמדים לליכוד באתר ועדת הבחירות עד 20.9?";
  check("one party spelled with two prefixes is one word", similar(a, b) === 1, `${similar(a, b).toFixed(2)}`);
}

console.log("\nsimilarity — word order");
{
  const a = "האם יאיר גולן יגיש תביעת דיבה נגד שרה נתניהו עד 31.12.2026?";
  const b = "האם שרה נתניהו תגיש תביעת דיבה נגד יאיר גולן עד 31.12.2026?";
  check("the mirrored lawsuit shares its words", similar(a, b) >= DUPLICATE_THRESHOLD, `${similar(a, b).toFixed(2)}`);
  check("...but not their order", ordered(a, b) < 0.35, `${ordered(a, b).toFixed(2)}`);
}
{
  const a = "האם נתניהו יעמוד בראש הממשלה הבאה של ישראל?";
  const b = "האם גדי איזנקוט יעמוד בראש הממשלה הבאה של ישראל?";
  check("one template, two subjects, keeps its order", ordered(a, b) > 0.5, `${ordered(a, b).toFixed(2)}`);
}
{
  // two questions on one subject, phrased differently, are not mirrors — the
  // reason bigram overlap could not be used for this
  const a = "האם ערוץ 14 יפרסם עד 15.10 סקר שבו 'עמך ישראל' עוברת את אחוז החסימה?";
  const b = "האם 'עמך ישראל' של וינטר תקבל 5 מנדטים ומעלה בסקר חדשות 12 עד 30.9?";
  check("different phrasing on one subject is not reversed order", ordered(a, b) >= 0.35, `${ordered(a, b).toFixed(2)}`);
}

console.log("\nduplicateRisk — what merge does with a pair");
{
  const a = market({ slug: "a", title: "האם ערוץ 14 יפרסם עד 15.9 סקר שנותן לליכוד 30 מנדטים ומעלה?" });
  const b = market({ slug: "b", title: "האם ערוץ 14 יפרסם עד 15.9 סקר שנותן לליכוד 30 מנדטים ומעלה?" });
  check("the same title twice is blocked", duplicateRisk(a, b).level === "block");
}
{
  // one event, two deadlines hours apart: the pattern nothing caught before.
  // Both of these were on the board at once, priced identically, in September 2026.
  const a = market({
    slug: "a",
    title: "האם תתקיים פגישה בין נתניהו לבן גביר על איחוד עם סמוטריץ', עד יום ראשון בערב (6.9)?",
    closesAt: at(20),
  });
  const b = market({
    slug: "b",
    title: "האם תתקיים פגישה פנים אל פנים בין נתניהו לבן גביר עד יום שני בבוקר (7.9, 09:00)?",
    closesAt: at(29),
  });
  const risk = duplicateRisk(a, b);
  check("overlapping windows on one event need a written reason", risk.level === "review", risk.level);
  check("...and the reason names the window", risk.reasons.includes("same-window"), risk.reasons.join(","));
}
{
  // the same wording with deadlines weeks apart is a ladder, not a duplicate:
  // "עד יום שני" and "עד סוף אוקטובר" are two questions people trade differently
  const a = market({ slug: "a", title: "האם נתניהו יעניק ריאיון לחדשות 12, לחדשות 13 או לכאן 11 עד יום שני?", closesAt: at(20) });
  const b = market({ slug: "b", title: "האם נתניהו יעניק ריאיון לחדשות 12, לחדשות 13 או לכאן 11 עד יום שני?", closesAt: at(20 + 30 * 24) });
  check("a distant deadline is not the same-window reason", !duplicateRisk(a, b).reasons.includes("same-window"));
  check("...but identical wording still blocks", duplicateRisk(a, b).level === "block");
}
{
  const shared = [{ url: "https://www.ynet.co.il/news/article/one" }, { url: "https://www.haaretz.co.il/two" }];
  const a = market({ slug: "a", title: "האם ש\"ס תגיש רשימה עצמאית עד 10.9?", sources: shared });
  const b = market({ slug: "b", title: "האם דגל התורה תפרוש מיהדות התורה עד 10.9?", sources: [...shared].reverse() });
  const risk = duplicateRisk(a, b);
  check("two questions off exactly the same articles are flagged", risk.reasons.includes("same-sources"), risk.reasons.join(","));
  check("...as review, not a block", risk.level === "review", risk.level);
}
{
  const a = market({ slug: "a", title: "האם ש\"ס תגיש רשימה עצמאית עד 10.9?", sources: [{ url: "https://www.ynet.co.il/one" }] });
  const b = market({ slug: "b", title: "האם דגל התורה תפרוש עד 10.9?", sources: [{ url: "https://www.ynet.co.il/one" }] });
  check("a single shared article is not enough to flag", !duplicateRisk(a, b).reasons.includes("same-sources"));
}
{
  const a = market({ slug: "a", title: "האם יאיר גולן יגיש תביעת דיבה נגד שרה נתניהו עד 31.12.2026?" });
  const b = market({ slug: "b", title: "האם שרה נתניהו תגיש תביעת דיבה נגד יאיר גולן עד 31.12.2026?" });
  const risk = duplicateRisk(a, b);
  check("the same words in the opposite direction are caught", risk.reasons.includes("mirror"), risk.reasons.join(","));
  check(
    "...and go to review rather than being thrown away as a duplicate title",
    risk.level === "review" && risk.reasons.includes("title"),
    `${risk.level} ${risk.reasons.join(",")}`,
  );
}
{
  const a = market({ slug: "a", title: "האם ועדת הבחירות תפסול את רשימת בל\"ד עד 20.9?" });
  const b = market({ slug: "b", title: "האם הבורסה תרד ב-3% ביום המסחר שאחרי הבחירות?" });
  check("unrelated questions come back clear", duplicateRisk(a, b).level === "clear");
}
{
  // the boilerplate every criterion shares must not be enough on its own
  const boiler =
    'יוכרע "כן" אם עד המועד ידווח באחד לפחות מהמקורות ynet, N12, כאן 11, הארץ, ישראל היום או וואלה. ' +
    'הודעה על כוונה אינה נחשבת. אם לא יתפרסם דיווח כזה — "לא".';
  const a = market({ slug: "a", title: "האם רע\"ם תעבור את אחוז החסימה בתוצאות הרשמיות?", resolutionCriteria: boiler, closesAt: at(500) });
  const b = market({ slug: "b", title: "האם הבורסה תרד ב-3% ביום המסחר שאחרי הבחירות?", resolutionCriteria: boiler, closesAt: at(900) });
  const risk = duplicateRisk(a, b);
  check("shared criteria wording alone does not block", risk.level !== "block", risk.level);
}
{
  const a = market({ slug: "a", title: "האם ועדת הבחירות תפסול את רשימת בל\"ד עד 20.9?", closesAt: "not-a-date" });
  const b = market({ slug: "b", title: "האם ועדת הבחירות תפסול את רשימת בל\"ד עד 20.9?" });
  check("an unparseable closesAt still blocks on the title", duplicateRisk(a, b).level === "block");
}

console.log(failures ? `\n${failures} failure(s).` : "\nall similarity checks passed.");
if (failures) process.exit(1);
