export interface Category {
  id: string;
  label: string;
  emoji: string;
  /** default cover image under /public/covers */
  cover: string;
  accent: string;
}

export const CATEGORIES: Category[] = [
  { id: "polls", label: "סקרים", emoji: "📊", cover: "/covers/polls.svg", accent: "#3b82f6" },
  { id: "coalition", label: "קואליציה וגושים", emoji: "🤝", cover: "/covers/coalition.svg", accent: "#8b5cf6" },
  { id: "parties", label: "מפלגות ופריימריז", emoji: "🗳️", cover: "/covers/parties.svg", accent: "#f59e0b" },
  { id: "netanyahu", label: "נתניהו", emoji: "🏛️", cover: "/covers/netanyahu.svg", accent: "#0ea5e9" },
  { id: "legal", label: "משפט ותביעות", emoji: "⚖️", cover: "/covers/legal.svg", accent: "#a855f7" },
  { id: "media", label: "תקשורת", emoji: "📺", cover: "/covers/media.svg", accent: "#ec4899" },
  { id: "security", label: "ביטחון ומדיניות", emoji: "🛡️", cover: "/covers/security.svg", accent: "#10b981" },
  { id: "haredi", label: "חרדים וגיוס", emoji: "📜", cover: "/covers/haredi.svg", accent: "#eab308" },
  { id: "knesset", label: "כנסת וחקיקה", emoji: "🏛", cover: "/covers/knesset.svg", accent: "#06b6d4" },
  { id: "election-day", label: "יום הבחירות", emoji: "📅", cover: "/covers/election-day.svg", accent: "#f97316" },
  { id: "general", label: "כללי", emoji: "🇮🇱", cover: "/covers/general.svg", accent: "#64748b" },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [string, ...string[]];

export function getCategory(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}
