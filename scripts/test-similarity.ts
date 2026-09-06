/**
 * The gate a new question has to pass, checked against the cases it actually has
 * to survive: the duplicate screen (src/lib/similarity.ts) and the rules
 * scripts/merge-markets.ts holds a *new* question to (src/lib/content.ts).
 *
 * Every case here is a real pair from data/markets.json or a real rejection the
 * pipeline made, because the failure mode of a similarity metric is not "wrong
 * number" — it is "plausible number that quietly throws away a good question, or
 * quietly lets the same question onto the board twice".
 */
import { similar, ordered, duplicateRisk, containment, DUPLICATE_THRESHOLD, type Comparable } from "../src/lib/similarity";
import { archetypeWarnings, NewMarketContentSchema, TITLE_LIMIT } from "../src/lib/content";

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

console.log("\ncontainment — one event, two questions");
{
  // both were open at once in September 2026, priced 58% and 15%: the filing that
  // resolves the Monday question resolves the December one with it
  const broad = market({
    slug: "golan-sues-sara-netanyahu-oct7",
    title: "האם יאיר גולן יגיש תביעת דיבה נגד שרה נתניהו עד 31.12.2026?",
    closesAt: at(24 * 115),
    people: ["yair-golan", "sara-netanyahu"],
  });
  const narrow = market({
    slug: "golan-files-defamation-suit-sara-netanyahu-monday",
    title: "האם יאיר גולן יגיש בפועל לבית המשפט את תביעת הדיבה נגד שרה נתניהו עד יום שני 7.9 בשעה 20:00?",
    closesAt: at(20),
    people: ["yair-golan", "sara-netanyahu"],
  });
  const found = containment(broad, narrow);
  check("the wider question is named as the wider one", found?.broad.slug === broad.slug, found ? found.broad.slug : "none");
  const risk = duplicateRisk(narrow, broad);
  check("a containment blocks the merge", risk.level === "block", `${risk.level} ${risk.reasons.join(",")}`);
  check("...and says so by name", risk.reasons.includes("contains"), risk.reasons.join(","));
  check("...and points at the wider question", risk.broader === broad.slug, `${risk.broader}`);
}
{
  // the ladder the title score cannot see at all: identical wording, two dates.
  // `similar` scores it 0.00, because almost every word is scaffolding.
  const a = market({
    slug: "joint-list-10-plus-mainstream-poll-by-oct15",
    title: "האם הרשימה המשותפת תגיע ל-10 מנדטים ומעלה בסקר של חדשות 12, חדשות 13 או כאן 11 עד 15.10.2026?",
    closesAt: at(24 * 39),
    people: ["yousef-jabareen", "ahmad-tibi"],
  });
  const b = market({
    slug: "joint-list-10-plus-mainstream-poll-by-sept30",
    title: "האם הרשימה המשותפת תגיע ל-10 מנדטים ומעלה בסקר של חדשות 12, חדשות 13 או כאן 11 עד 30.9.2026?",
    closesAt: at(24 * 24),
    people: ["yousef-jabareen", "ayman-odeh", "ahmad-tibi"],
  });
  check("the title score misses the ladder entirely", similar(a.title, b.title) < DUPLICATE_THRESHOLD, `${similar(a.title, b.title).toFixed(2)}`);
  check("...and containment catches it", duplicateRisk(a, b).level === "block", duplicateRisk(a, b).reasons.join(","));
}
{
  // one template, two candidates, one cast list — the pair that must survive.
  // Both markets list the same three people, so the cast cannot tell them apart
  // and the words have to.
  const a = market({
    slug: "netanyahu-heads-next-government",
    title: "האם נתניהו יעמוד בראש הממשלה הבאה של ישראל?",
    people: ["benjamin-netanyahu", "gadi-eisenkot", "isaac-herzog"],
  });
  const b = market({
    slug: "eisenkot-heads-next-government",
    title: "האם גדי איזנקוט יעמוד בראש הממשלה הבאה של ישראל?",
    people: ["gadi-eisenkot", "benjamin-netanyahu", "isaac-herzog"],
  });
  check("two candidates for one job are not a containment", containment(a, b) === null);
  check("...and are not blocked", duplicateRisk(a, b).level !== "block", duplicateRisk(a, b).reasons.join(","));
}
{
  // two thresholds are two markets, whatever the rest of the sentence says
  const a = market({
    slug: "a",
    title: "האם הליכוד יקבל 30 מנדטים ומעלה בסקר של חדשות 12 עד 30.9.2026?",
    people: ["benjamin-netanyahu"],
  });
  const b = market({
    slug: "b",
    title: "האם הליכוד יקבל 25 מנדטים ומעלה בסקר של חדשות 12 עד 30.9.2026?",
    people: ["benjamin-netanyahu"],
  });
  check("a different threshold is a different question", containment(a, b) === null);
}
{
  // no cast, no containment: the screen refuses to guess who a question is about
  const a = market({ slug: "a", title: "האם ועדת הבחירות תפסול רשימה עד 20.9?" });
  const b = market({ slug: "b", title: "האם ועדת הבחירות תפסול רשימה כלשהי עד 20.9 בשעה 18:00?" });
  check("without people the containment screen stays quiet", containment(a, b) === null);
}
{
  // same cast, same verb, two hours apart, but worded far enough apart that
  // nothing else sees them: review, so the writer has to read both criteria
  const a = market({
    slug: "netanyahu-responds-hcj-draft-arrests-sunday",
    title: 'האם נתניהו יתייחס בפומבי לפסיקת בג"ץ על מעצרי העריקים החרדים, עד יום ראשון 6.9 בשעה 20:00?',
    closesAt: at(20),
    people: ["benjamin-netanyahu", "yariv-levin"],
  });
  const b = market({
    slug: "netanyahu-cabinet-remarks-draft-ruling-sunday",
    title: 'האם נתניהו יתייחס לפסיקת בג"ץ על חוק הקפאת המעצרים בדברי הפתיחה לישיבת הממשלה ב-6.9?',
    closesAt: at(18),
    people: ["benjamin-netanyahu", "yariv-levin"],
  });
  const risk = duplicateRisk(a, b);
  check("one cast, one verb, one window is at least a review", risk.level === "review", `${risk.level} ${risk.reasons.join(",")}`);
  check("...named as one event", risk.reasons.includes("one-event"), risk.reasons.join(","));
}

console.log("\narchetypes — question shapes that cannot be settled");
{
  const flagged = (title: string) => archetypeWarnings({ title }).length > 0;
  check("״ידווח על…״ is flagged", flagged("האם ידווח על פגישה בין נתניהו לדרעי עד 6.9 בחצות?"));
  check("...but a poll that either exists or does not is not", !flagged("האם יפורסם עד 8.9 בערב סקר שבו הליכוד יורד מתחת ל-19 מנדטים?"));
  check("״יתייחס״ is flagged", flagged('האם נתניהו יתייחס לפסיקת בג"ץ בדברי הפתיחה לישיבת הממשלה ב-6.9?'));
  check("an unnamed party is flagged", flagged("האם מפלגה נוספת תודיע עד מוצאי שבת על פרישה מהמרוץ?"));
  check("the state of a live page at an instant is flagged", flagged("האם באתר ועדת הבחירות תופיע הרשימה בשעה 20:00 ב-10.9?"));
  check("a near-daily event with no threshold is flagged", flagged("האם יתקיים דיון במשפט נתניהו עד 10 בנובמבר 2026?"));
  check("...and the same event with a threshold is not", !flagged("האם יתקיימו לפחות שלושה דיונים במשפט נתניהו עד 10 בנובמבר 2026?"));
  check("an ordinary question is not flagged", !flagged("האם רשימת הליכוד תוגש לוועדת הבחירות עד 10.9.2026?"));
}

console.log("\nthe gate a new question passes (merge)");
{
  const base = {
    slug: "test-question",
    title: "האם רשימת הליכוד תוגש לוועדת הבחירות המרכזית עד 10.9.2026 בחצות?",
    subtitle: "מועד הגשת הרשימות נעול בחוק — השאלה היא אם הליכוד יגיש לפניו",
    description: "בדיקה של שער הכניסה לשאלות חדשות, עם מספיק טקסט כדי לעבור את המינימום של הסכמה.",
    resolutionCriteria:
      'יוכרע "כן" אם עד המועד תפורסם הרשימה באתר ועדת הבחירות המרכזית או ידווח עליה באחד לפחות מהמקורות ynet, N12 או כאן 11. אחרת — "לא".',
    category: "parties" as const,
    closesAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    initialProbability: 0.6,
    createdAt: new Date().toISOString(),
  };
  const parse = (over: Record<string, unknown>) => NewMarketContentSchema.safeParse({ ...base, ...over });
  check("a well-formed question passes", parse({}).success, JSON.stringify(parse({}).error?.issues?.[0]));
  check(
    `a title over ${TITLE_LIMIT} characters is refused`,
    !parse({ title: `${base.title} ${"מילה ".repeat(10)}` }).success,
  );
  check("a question closing this week needs a subtitle", !parse({ subtitle: undefined }).success);
  check(
    "...and one closing in a month does not",
    parse({ subtitle: undefined, closesAt: new Date(Date.now() + 60 * 86_400_000).toISOString() }).success,
  );
  check("an opening price outside 15–85% is refused", !parse({ initialProbability: 0.04 }).success);
  check("...unless the question is a long-horizon one", parse({ initialProbability: 0.04, closesAt: new Date(Date.now() + 90 * 86_400_000).toISOString(), subtitle: undefined }).success);
}

console.log(failures ? `\n${failures} failure(s).` : "\nall pipeline checks passed.");
if (failures) process.exit(1);
