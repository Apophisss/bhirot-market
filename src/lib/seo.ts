import type { Metadata } from "next";
import type { MarketView } from "./markets";
import { getPerson } from "./content";
import { getCategory, type Category } from "./categories";
import { ELECTION_DATE, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_TEAM, SITE_URL } from "./config";
import { MAX_REFERRALS, REFERRAL_BONUS } from "./referral";

/** Absolute URL for a site-relative path — canonical tags and JSON-LD need the full form. */
export function absUrl(path = "/"): string {
  return new URL(path, SITE_URL).toString();
}

/** Trim to `max` chars on a word boundary so meta descriptions never end mid-word. */
export function clamp(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,.;:־-]+$/, "")}…`;
}

/** The site-wide share card, used by every page that has no picture of its own. */
export const SITE_OG_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: `${SITE_NAME} — ${SITE_TAGLINE}`,
} as const;

type ShareImage = { url: string; width?: number; height?: number; type?: string; alt?: string };

/**
 * The `openGraph` + `twitter` half of a page's metadata, filled in completely.
 *
 * Next merges metadata shallowly: a page that sets `openGraph` (or `twitter`)
 * replaces the parent object outright rather than adding to it. A page that only
 * wanted its own og:title therefore dropped the site's og:image, og:site_name,
 * og:locale and og:type — and left the Twitter card advertising the home page.
 * Building both objects here instead of by hand is what keeps that from
 * happening again: every field the layout would have contributed is restated.
 *
 * Pass `images: null` only where something else in the segment supplies the
 * picture; an omitted `images` falls back to the site card rather than to nothing.
 */
export function shareCard(opts: {
  /** exact og:title/twitter:title — pages usually want `${pageTitle} | ${SITE_NAME}` */
  title: string;
  description?: string;
  /** site-relative path; becomes og:url */
  path: string;
  images?: ShareImage[] | null;
  type?: "website" | "article";
  /** og article:* fields, for market pages */
  article?: {
    publishedTime?: string;
    modifiedTime?: string;
    section?: string;
    tags?: string[];
    authors?: string[];
  };
}): Pick<Metadata, "openGraph" | "twitter"> {
  const description = opts.description ?? SITE_DESCRIPTION;
  const images = opts.images === null ? undefined : (opts.images ?? [SITE_OG_IMAGE]);
  return {
    openGraph: {
      type: opts.type ?? "website",
      siteName: SITE_NAME,
      locale: "he_IL",
      url: opts.path,
      title: opts.title,
      description,
      ...(images ? { images } : {}),
      ...(opts.article ?? {}),
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description,
      ...(images ? { images: images.map((i) => i.url) } : {}),
    },
  };
}

const ORG_ID = absUrl("/#organization");
const SITE_ID = absUrl("/#website");

/** Publisher/author node reused by every other node in the graph. */
export function organizationNode() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    alternateName: "Bhirot Market",
    url: absUrl("/"),
    description: SITE_DESCRIPTION,
    logo: { "@type": "ImageObject", url: absUrl("/logo.svg") },
    image: absUrl("/og.png"),
    knowsLanguage: "he-IL",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      url: absUrl("/contact"),
      availableLanguage: ["he", "en"],
    },
  };
}

export function websiteNode() {
  return {
    "@type": "WebSite",
    "@id": SITE_ID,
    url: absUrl("/"),
    name: SITE_NAME,
    alternateName: SITE_TAGLINE,
    description: SITE_DESCRIPTION,
    inLanguage: "he-IL",
    publisher: { "@id": ORG_ID },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${absUrl("/")}?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

/** Site-wide graph, rendered once in the root layout. */
export function siteGraph() {
  return { "@context": "https://schema.org", "@graph": [organizationNode(), websiteNode()] };
}

/** Breadcrumb node without the @context wrapper, so it can also live inside a @graph. */
export function breadcrumbNode(trail: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: absUrl(t.path),
    })),
  };
}

export function breadcrumbs(trail: { name: string; path: string }[]) {
  return { "@context": "https://schema.org", ...breadcrumbNode(trail) };
}

/** Ordered list of markets — used on the home page and on every category page. */
export function marketListNode(markets: MarketView[], name: string) {
  return {
    "@type": "ItemList",
    name,
    numberOfItems: markets.length,
    itemListElement: markets.map((m, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: absUrl(`/market/${m.id}`),
      name: m.title,
    })),
  };
}

export function collectionPage(opts: {
  path: string;
  name: string;
  description: string;
  markets: MarketView[];
}) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": absUrl(opts.path),
        url: absUrl(opts.path),
        name: opts.name,
        description: opts.description,
        inLanguage: "he-IL",
        isPartOf: { "@id": SITE_ID },
        publisher: { "@id": ORG_ID },
        mainEntity: marketListNode(opts.markets, opts.name),
      },
    ],
  };
}

/** People mentioned by a market, as schema.org Persons linked to their Wikipedia entry. */
function peopleNodes(ids: string[]) {
  return ids
    .map((id) => getPerson(id))
    .filter((p) => p !== undefined)
    .map((p) => ({
      "@type": "Person",
      name: p.name,
      ...(p.role ? { jobTitle: p.role } : {}),
      ...(p.wiki ? { sameAs: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.wiki.replace(/ /g, "_"))}` } : {}),
    }));
}

/** A market page: the question as an Article, plus its breadcrumb trail. */
export function marketGraph(m: MarketView) {
  const cat = getCategory(m.category);
  const url = absUrl(`/market/${m.id}`);
  const about = peopleNodes(m.people);
  const resolutionText =
    m.status === "resolved" ? `הוכרע: ${m.resolution === "YES" ? "כן" : "לא"}. ${m.resolutionNote ?? ""}` : "";
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#article`,
        mainEntityOfPage: url,
        url,
        headline: clamp(m.title, 110),
        name: m.title,
        description: clamp(m.subtitle ?? m.description, 200),
        articleBody: [m.description, m.resolutionCriteria, resolutionText].filter(Boolean).join("\n\n"),
        articleSection: cat.label,
        inLanguage: "he-IL",
        datePublished: new Date(m.createdAt).toISOString(),
        dateModified: new Date(m.updatedAt).toISOString(),
        // the generated share card first: it is the only 1200x630 picture the question
        // has, and the category covers are SVG, which Google Discover will not take
        image: [absUrl(`/market/${m.id}/og`), absUrl(m.image)],
        author: { "@type": "Organization", name: `${SITE_TEAM}, ${SITE_NAME}`, url: absUrl("/about") },
        publisher: { "@id": ORG_ID },
        isPartOf: { "@id": SITE_ID },
        isAccessibleForFree: true,
        ...(m.tags.length ? { keywords: m.tags.join(", ") } : {}),
        ...(about.length ? { about } : {}),
        ...(m.sources.length
          ? { citation: m.sources.map((s) => ({ "@type": "CreativeWork", name: s.title, url: s.url })) }
          : {}),
      },
      breadcrumbNode([
        { name: "שווקים", path: "/" },
        { name: cat.label, path: `/category/${cat.id}` },
        { name: clamp(m.title, 70), path: `/market/${m.id}` },
      ]),
    ],
  };
}

export function categoryTitle(cat: Category): string {
  return `${cat.label} — שוקי חיזוי לבחירות 2026`;
}

/** Questions shown on /about and mirrored into FAQPage structured data. */
export const FAQ: { q: string; a: string }[] = [
  {
    q: `מה זה ${SITE_NAME}?`,
    a: `${SITE_NAME} הוא שוק חיזויים בכסף וירטואלי על הבחירות לכנסת ה־26. סוחרים קונים מניות "כן" או "לא" על שאלות פוליטיות — סקרים, קואליציה, חקיקה ומשפטים — והמחיר שנוצר הוא ההסתברות שהשוק מייחס לתשובה "כן".`,
  },
  {
    q: "האם זה הימורים בכסף אמיתי?",
    a: "לא. כל המסחר באתר הוא בכסף וירטואלי בלבד. אי אפשר להפקיד או למשוך כסף, אין לנקודות שום ערך כספי, וזה אינו אתר הימורים ואינו ייעוץ מכל סוג.",
  },
  {
    q: "איך נקבע המחיר בשוק?",
    a: 'המחיר נקבע על ידי עושה שוק אוטומטי מסוג LMSR (Logarithmic Market Scoring Rule) ולא על ידי ספר פקודות. כל קנייה של "כן" מעלה את המחיר וכל קנייה של "לא" מורידה אותו, בהתאם לפרמטר הנזילות של השוק.',
  },
  {
    q: "כמה כסף וירטואלי מקבלים בהתחלה?",
    a: "כל משתמש/ת שמתחבר/ת עם חשבון Google מקבל/ת ₪10,000 וירטואליים. לוח המובילים מדרג לפי שווי כולל — היתרה בתוספת מה שיתקבל על הפוזיציות הפתוחות אם יימכרו עכשיו — והוא אנונימי: כל סוחר/ת מופיע/ה בכינוי אקראי, בלי שם ובלי תמונה.",
  },
  {
    q: "מה זה הקישור האישי להזמנת חברים?",
    a: `לכל משתמש/ת יש קישור אישי לשיתוף האתר. כל מי שנרשם דרך הקישור מזכה אתכם ב־₪${REFERRAL_BONUS.toLocaleString("en-US")} וירטואליים שנכנסים ליתרה מיד, עד ${MAX_REFERRALS} חברים. הבונוס נספר בשווי הכולל אבל לא ברווח/הפסד, כך שלוח המובילים ממשיך למדוד חיזוי בלבד.`,
  },
  {
    q: "מי כותב את השאלות?",
    a: `${SITE_TEAM} של ${SITE_NAME} עוקב לאורך היום אחרי החדשות הפוליטיות בישראל, מנסח שאלות חדשות עם מועד יעד וקריטריוני הכרעה מפורשים, ומכריע שווקים שהאירוע שלהם כבר קרה. כל שאלה שנוספה אחרי ההשקה נושאת את הקרדיט של ${SITE_TEAM}.`,
  },
  {
    q: "איך שוק מוכרע?",
    a: 'בכל שוק מוגדר מראש מה נחשב "כן", מה נחשב "לא" ואיזה מקור מכריע. עם ההכרעה כל מניה של הצד הצודק משלמת ₪1 וירטואלי, ומניות הצד השני שוות אפס. שוק שהתברר כלא ניתן להכרעה מבוטל וכל הכסף מוחזר.',
  },
  {
    q: "מתי מתקיימות הבחירות לכנסת ה־26?",
    a: `מועד הבחירות הקבוע בחוק הוא ${new Date(ELECTION_DATE).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}. אם ייקבעו בחירות מוקדמות, השאלות באתר והמועד שמופיע בספירה לאחור יתעדכנו בהתאם.`,
  },
];

export function faqGraph() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${absUrl("/about")}#faq`,
    inLanguage: "he-IL",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}
