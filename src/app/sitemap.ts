import type { MetadataRoute } from "next";
import { listMarkets } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";
import { CATEGORIES } from "@/lib/categories";
import { SITE_URL } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await ensureSynced();
  const markets = await listMarkets({ status: "all", limit: 1000 });
  const newest = markets.reduce<Date | undefined>(
    (acc, m) => (!acc || m.updatedAt > acc ? m.updatedAt : acc),
    undefined,
  );

  // one entry per category landing page, dated by the freshest market in it
  const categories: MetadataRoute.Sitemap = CATEGORIES.flatMap((c) => {
    const inCategory = markets.filter((m) => m.category === c.id);
    if (!inCategory.length) return [];
    const lastModified = inCategory.reduce((acc, m) => (m.updatedAt > acc ? m.updatedAt : acc), inCategory[0].updatedAt);
    return [{ url: `${SITE_URL}/category/${c.id}`, lastModified, changeFrequency: "daily" as const, priority: 0.7 }];
  });

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: newest, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/?status=resolved`, lastModified: newest, changeFrequency: "daily", priority: 0.4 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/leaderboard`, changeFrequency: "hourly", priority: 0.4 },
    { url: `${SITE_URL}/activity`, changeFrequency: "hourly", priority: 0.4 },
    { url: `${SITE_URL}/suggest`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/contact`, changeFrequency: "monthly", priority: 0.4 },
  ];

  return [
    ...staticPages,
    ...categories,
    ...markets
      .filter((m) => m.status !== "cancelled")
      .map((m) => ({
        url: `${SITE_URL}/market/${m.id}`,
        lastModified: m.updatedAt,
        changeFrequency: "hourly" as const,
        priority: m.status === "open" ? 0.8 : 0.3,
      })),
  ];
}
