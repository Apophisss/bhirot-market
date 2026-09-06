import type { MetadataRoute } from "next";
import { listMarkets } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";
import { CATEGORIES } from "@/lib/categories";
import { LEGAL_UPDATED, SITE_URL } from "@/lib/config";

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

  /*
    The resolutions listing is submitted only once there is a resolution to show.
    `?status=resolved` also matches cancelled questions — that is the right thing on
    the page, where "this one could not be decided" belongs next to the verdicts, but
    it is the wrong thing to submit: with nothing actually resolved the URL was a
    heading that says "שאלות שהוכרעו" above a list of cancellations, which is a thin
    page asking to be crawled and a promise the page does not keep.
  */
  const resolvedCount = markets.filter((m) => m.status === "resolved").length;

  /*
    /invite, /suggest and /contact are gone from here on purpose. The first is a
    personal link behind a login, and the other two are a form each: nothing on them
    answers a search, and submitting them spends crawl budget that the ~350 questions
    need. They stay indexable and linked from the footer — this file is what we ask
    Google to come and fetch, not the list of pages that are allowed to exist.
  */
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: newest, changeFrequency: "hourly", priority: 1 },
    ...(resolvedCount
      ? [{ url: `${SITE_URL}/?status=resolved`, lastModified: newest, changeFrequency: "daily" as const, priority: 0.4 }]
      : []),
    { url: `${SITE_URL}/rapid`, lastModified: newest, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/leaderboard`, changeFrequency: "hourly", priority: 0.4 },
    { url: `${SITE_URL}/activity`, changeFrequency: "hourly", priority: 0.4 },
    { url: `${SITE_URL}/privacy`, lastModified: new Date(LEGAL_UPDATED), changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, lastModified: new Date(LEGAL_UPDATED), changeFrequency: "yearly", priority: 0.2 },
  ];

  return [
    ...staticPages,
    ...categories,
    ...markets
      .filter((m) => m.status !== "cancelled")
      .map((m) => ({
        url: `${SITE_URL}/market/${m.id}`,
        lastModified: m.updatedAt,
        /*
          Every open question used to declare `hourly`. A question's text, criteria and
          deadline are written once and then left alone — the only thing that moves
          hourly is the gauge — so telling Google that 350 pages change every hour is
          asking it to re-crawl the whole board all day and getting the same document
          back. A resolved question is finished: it never changes again.
        */
        changeFrequency: m.status === "open" ? ("daily" as const) : ("monthly" as const),
        priority: m.status === "open" ? 0.8 : 0.3,
      })),
  ];
}
