import { ImageResponse } from "next/og";
import { getMarket } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";
import { getCategory } from "@/lib/categories";
import { SITE_NAME } from "@/lib/config";
import { fmtDate } from "@/lib/format";
import { OG, OG_SIZE, embedPhoto, fit, ogFonts } from "@/lib/og";

// the market itself is force-dynamic; the card has to follow it or a question's
// price would be frozen at whatever it was the first time a crawler asked
export const dynamic = "force-dynamic";

// A hand-written route rather than the `opengraph-image` file convention: the
// convention needs `generateImageMetadata` to put the question into og:image:alt,
// and Next then runs that function as the route's `generateStaticParams` with no
// slug, which 500s the very URL it just advertised. A plain handler also gives the
// card a stable, guessable URL that the JSON-LD `image` can point at.
const HEADERS = { "cache-control": "public, max-age=300, stale-while-revalidate=86400" };

/**
 * The share card for a single market: the question, the price the market is
 * quoting right now, and the person it is about.
 *
 * Before this every question shared the one static `/og.png`, so a link posted to
 * WhatsApp or X said nothing about which question it was. The odds are the whole
 * draw of a prediction market, so they belong in the preview.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  await ensureSynced();
  const { slug } = await params;
  const m = await getMarket(slug);
  const fonts = await ogFonts();

  // a card is rendered for a slug that no longer resolves too (a crawler holding an
  // old link); the branded fallback beats a broken image in the preview
  if (!m) {
    return new ImageResponse(<Fallback />, { ...OG_SIZE, fonts, headers: HEADERS });
  }

  const cat = getCategory(m.category);
  const pct = Math.round(m.probability * 100);
  const photo = await embedPhoto(m.image);
  const resolved = m.status === "resolved";
  const yesWon = m.resolution === "YES";
  const accent = resolved ? (yesWon ? OG.yes : OG.no) : OG.accent;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: "56px 64px",
          backgroundColor: OG.brand,
          backgroundImage: `linear-gradient(135deg, ${OG.brandDeep} 0%, ${OG.brand} 55%, #16418f 100%)`,
          color: OG.ink,
          fontFamily: "Heebo",
        }}
      >
        {/* row-reverse rather than `direction: rtl`: satori mirrors the text runs on its
            own but not the flex axis, so the wordmark would end up on the left */}
        <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", gap: 16 }}>
            <Logo />
            <div style={{ fontSize: 30, fontWeight: 800 }}>{SITE_NAME}</div>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 24,
              color: OG.muted,
              border: `2px solid rgba(255,255,255,0.22)`,
              borderRadius: 999,
              padding: "8px 22px",
            }}
          >
            {cat.label}
          </div>
        </div>

        {/* question */}
        <div style={{ display: "flex", flexDirection: "row-reverse", flex: 1, alignItems: "center", gap: 40, marginTop: 8 }}>
          {photo ? (
            // satori draws to a raster: next/image has nothing to optimise here, and
            // alt text on a pixel inside a PNG has no one to read it — og:image:alt
            // (set on the page) is what a screen reader gets
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img
              src={photo}
              width={190}
              height={190}
              style={{ width: 190, height: 190, borderRadius: 999, objectFit: "cover", border: "6px solid rgba(255,255,255,0.18)" }}
            />
          ) : null}
          <div
            style={{
              display: "flex",
              flex: 1,
              fontSize: m.title.length > 78 ? 46 : 56,
              fontWeight: 800,
              lineHeight: 1.25,
              textAlign: "right",
            }}
          >
            {fit(m.title, 130)}
          </div>
        </div>

        {/* the price, or the answer once the question is settled */}
        <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "baseline", gap: 12 }}>
              <div style={{ fontSize: 82, fontWeight: 800, color: accent }}>
                {resolved ? (yesWon ? "כן" : "לא") : `${pct}%`}
              </div>
              <div style={{ fontSize: 30, color: OG.muted }}>{resolved ? "התשובה" : "סיכוי ל״כן״"}</div>
            </div>
            {/* the bar reads right-to-left: the filled part is the "yes" side */}
            <div
              style={{
                display: "flex",
                flexDirection: "row-reverse",
                width: 420,
                height: 14,
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.16)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: `${resolved ? (yesWon ? 100 : 0) : pct}%`,
                  height: 14,
                  borderRadius: 999,
                  backgroundColor: accent,
                }}
              />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", fontSize: 26, color: OG.muted }}>
            <div style={{ display: "flex" }}>{resolved ? "הוכרע" : "נסגר"}</div>
            <div style={{ display: "flex", color: OG.ink, fontWeight: 800 }}>
              {fmtDate(resolved && m.resolvedAt ? m.resolvedAt : m.closesAt)}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts, headers: HEADERS },
  );
}

function Logo() {
  return (
    <svg width="52" height="52" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="16" fill="#ffffff" />
      <rect x="14" y="30" width="36" height="22" rx="4" fill={OG.brand} />
      <rect x="11" y="27" width="42" height="6" rx="3" fill={OG.accent} />
      <rect x="24" y="12" width="16" height="20" rx="2" fill={OG.brand} />
    </svg>
  );
}

function Fallback() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        width: "100%",
        height: "100%",
        backgroundColor: OG.brand,
        backgroundImage: `linear-gradient(135deg, ${OG.brandDeep} 0%, ${OG.brand} 55%, #16418f 100%)`,
        color: OG.ink,
        fontFamily: "Heebo",
      }}
    >
      <Logo />
      <div style={{ fontSize: 64, fontWeight: 800 }}>{SITE_NAME}</div>
      <div style={{ fontSize: 32, color: OG.muted }}>שוק החיזויים של בחירות 2026</div>
    </div>
  );
}
