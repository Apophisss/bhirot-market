export interface Category {
  id: string;
  label: string;
  /** default cover image under /public/covers */
  cover: string;
  accent: string;
}

export const CATEGORIES: Category[] = [
  { id: "polls", label: "סקרים", cover: "/covers/polls.svg", accent: "#1d4ed8" },
  { id: "coalition", label: "קואליציה וגושים", cover: "/covers/coalition.svg", accent: "#5b21b6" },
  { id: "parties", label: "מפלגות ופריימריז", cover: "/covers/parties.svg", accent: "#b45309" },
  { id: "netanyahu", label: "נתניהו", cover: "/covers/netanyahu.svg", accent: "#0369a1" },
  { id: "legal", label: "משפט ותביעות", cover: "/covers/legal.svg", accent: "#7e22ce" },
  { id: "media", label: "תקשורת", cover: "/covers/media.svg", accent: "#be185d" },
  { id: "security", label: "ביטחון ומדיניות", cover: "/covers/security.svg", accent: "#047857" },
  { id: "haredi", label: "חרדים וגיוס", cover: "/covers/haredi.svg", accent: "#a16207" },
  { id: "knesset", label: "כנסת וחקיקה", cover: "/covers/knesset.svg", accent: "#0e7490" },
  { id: "election-day", label: "יום הבחירות", cover: "/covers/election-day.svg", accent: "#c2410c" },
  { id: "general", label: "כללי", cover: "/covers/general.svg", accent: "#475569" },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [string, ...string[]];

export function getCategory(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}
