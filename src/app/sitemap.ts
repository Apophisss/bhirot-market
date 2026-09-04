import type { MetadataRoute } from "next";
import { listMarkets } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";
import { CATEGORIES } from "@/lib/categories";
import { SITE_URL } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await ensureSynced();
  const markets = await listMarkets({ status: "all", limit: 1000 });
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/leaderboard`, changeFrequency: "hourly", priority: 0.4 },
    { url: `${SITE_URL}/activity`, changeFrequency: "hourly", priority: 0.4 },
    ...CATEGORIES.map((c) => ({
      url: `${SITE_URL}/?category=${c.id}`,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
  return [
    ...staticPages,
    ...markets.map((m) => ({
      url: `${SITE_URL}/market/${m.id}`,
      lastModified: m.updatedAt,
      changeFrequency: "hourly" as const,
      priority: m.status === "open" ? 0.8 : 0.3,
    })),
  ];
}
