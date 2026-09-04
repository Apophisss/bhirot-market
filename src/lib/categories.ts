export interface Category {
  id: string;
  label: string;
  /** default cover image under /public/covers */
  cover: string;
  accent: string;
  /** one-liner shown on /category/<id> and used as its meta description */
  description: string;
}

export const CATEGORIES: Category[] = [
  {
    id: "polls",
    label: "סקרים",
    cover: "/covers/polls.svg",
    accent: "#1d4ed8",
    description:
      "שוקי חיזוי על סקרי הבחירות 2026: כמה מנדטים ייתן הסקר הבא לליכוד, לדמוקרטים ולמפלגות הימין והמרכז, ומה יפרסמו ערוץ 12, ערוץ 13, כאן וערוץ 14.",
  },
  {
    id: "coalition",
    label: "קואליציה וגושים",
    cover: "/covers/coalition.svg",
    accent: "#5b21b6",
    description:
      "שוקי חיזוי על הרכבת הממשלה הבאה: גודל הגושים, מי ימליץ על מי, אילו מפלגות יתחייבו לשבת יחד ומי יוביל את הקואליציה אחרי הבחירות לכנסת ה־26.",
  },
  {
    id: "parties",
    label: "מפלגות ופריימריז",
    cover: "/covers/parties.svg",
    accent: "#b45309",
    description:
      "שוקי חיזוי על מיזוגים, פילוגים, רשימות משותפות, פריימריז וראשי מפלגות — מי ירוץ, מי יפרוש ומי יעמוד בראש הרשימה בבחירות 2026.",
  },
  {
    id: "netanyahu",
    label: "נתניהו",
    cover: "/covers/netanyahu.svg",
    accent: "#0369a1",
    description:
      "שוקי חיזוי סביב בנימין נתניהו: הופעות ועדויות, ריאיונות, מהלכים פוליטיים, מיקומו בסקרים וסיכוייו להרכיב את הממשלה הבאה.",
  },
  {
    id: "legal",
    label: "משפט ותביעות",
    cover: "/covers/legal.svg",
    accent: "#7e22ce",
    description:
      "שוקי חיזוי על ההליכים המשפטיים של הקמפיין: משפט נתניהו, עתירות לבג״ץ, תביעות דיבה, החלטות היועצת המשפטית וועדת הבחירות המרכזית.",
  },
  {
    id: "media",
    label: "תקשורת",
    cover: "/covers/media.svg",
    accent: "#be185d",
    description:
      "שוקי חיזוי על התקשורת הישראלית בקמפיין: עימותים באולפן, ריאיונות, מהלכים בערוצי החדשות ומה יתפרסם עד מועד היעד.",
  },
  {
    id: "security",
    label: "ביטחון ומדיניות",
    cover: "/covers/security.svg",
    accent: "#047857",
    description:
      "שוקי חיזוי על ביטחון ומדיניות חוץ: החלטות קבינט, מינויים בכירים, מהלכים מול השכנים ומול וושינגטון, וכיצד הם ישפיעו על מערכת הבחירות.",
  },
  {
    id: "haredi",
    label: "חרדים וגיוס",
    cover: "/covers/haredi.svg",
    accent: "#a16207",
    description:
      "שוקי חיזוי על חוק הגיוס והמפלגות החרדיות: קריאות בכנסת, פסיקות בג״ץ, הנחיות מועצות גדולי התורה ומיקום ש״ס ויהדות התורה בסקרים.",
  },
  {
    id: "knesset",
    label: "כנסת וחקיקה",
    cover: "/covers/knesset.svg",
    accent: "#0e7490",
    description:
      "שוקי חיזוי על הכנסת: הצעות חוק, הצבעות אי־אמון, פיזור הכנסת, ועדות ומועדי המושבים — מה יעבור ומה ייפול עד מועד היעד.",
  },
  {
    id: "election-day",
    label: "יום הבחירות",
    cover: "/covers/election-day.svg",
    accent: "#c2410c",
    description:
      "שוקי חיזוי על יום הבחירות עצמו: מועד הבחירות לכנסת ה־26, אחוזי ההצבעה, מדגמי המוצא ותוצאות הספירה.",
  },
  {
    id: "general",
    label: "כללי",
    cover: "/covers/general.svg",
    accent: "#475569",
    description:
      "שוקי חיזוי נוספים על הפוליטיקה הישראלית לקראת בחירות 2026 — כל מה שלא נכנס לקטגוריות האחרות.",
  },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [string, ...string[]];

export function getCategory(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

/** Strict lookup — returns undefined for an unknown id, so routes can 404. */
export function findCategory(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}
