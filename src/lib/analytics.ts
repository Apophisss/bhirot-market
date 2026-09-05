/**
 * Google Analytics 4 + Google Ads measurement.
 *
 * Nothing here runs unless the ids are configured, so a local checkout and a
 * fork stay tag-free. Two ids are supported at once because they answer
 * different questions: GA4 (`G-…`) is where you read behaviour, Google Ads
 * (`AW-…`) is what the campaign bids on. Wiring both means Demand Gen gets the
 * conversion signal directly, without waiting on the GA4→Ads import delay.
 */

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";
export const ADS_ID = process.env.NEXT_PUBLIC_ADS_ID ?? "";

/** `AW-123/AbC-D_xyz` conversion labels, copied out of the Google Ads conversion action. */
const ADS_LABELS: Record<ConversionEvent, string> = {
  sign_up: process.env.NEXT_PUBLIC_ADS_LABEL_SIGNUP ?? "",
  first_trade: process.env.NEXT_PUBLIC_ADS_LABEL_FIRST_TRADE ?? "",
};

export const analyticsEnabled = Boolean(GA_ID || ADS_ID);

/**
 * The two conversions worth optimising for.
 *
 * `sign_up` is the cheap, frequent one — it gets the campaign out of the
 * learning phase. `first_trade` is the one that means something: a registered
 * user who never places a trade is not a user. Bid on `first_trade` once it
 * clears ~15 a month; until then `sign_up` is the only signal with volume.
 */
export type ConversionEvent = "sign_up" | "first_trade";

export interface Conversion {
  name: ConversionEvent;
  /** Modelled shekel worth of the event — Google needs a number to compare conversions, not a real payment. */
  value?: number;
}

/** `send_to` target for a conversion, or "" when no Ads label is configured for it. */
export function adsSendTo(name: ConversionEvent): string {
  const label = ADS_LABELS[name];
  return ADS_ID && label ? `${ADS_ID}/${label}` : "";
}

/* ---------------- attribution cookie ---------------- */

/** Campaign params are kept client-side in this cookie until a user id exists to attach them to. */
export const ATTR_COOKIE = "bm_attr";
/** Google's own gclid attribution window is 90 days; matching it keeps our numbers comparable to theirs. */
export const ATTR_MAX_AGE = 90 * 24 * 60 * 60;

export interface Attribution {
  gclid?: string;
  utmSource?: string;
  utmCampaign?: string;
}

const FIELD_MAX = 200;

function clean(v: string | null | undefined): string | undefined {
  const t = (v ?? "").trim().slice(0, FIELD_MAX);
  return t || undefined;
}

/** Pulls campaign params off a URL query string. Returns null when there is nothing worth storing. */
export function readAttribution(search: string | URLSearchParams): Attribution | null {
  const q = typeof search === "string" ? new URLSearchParams(search) : search;
  const attr: Attribution = {
    gclid: clean(q.get("gclid")),
    // gbraid/wbraid replace gclid on iOS when the click can't be joined to a cookie
    utmSource: clean(q.get("utm_source")),
    utmCampaign: clean(q.get("utm_campaign")),
  };
  if (!attr.gclid) attr.gclid = clean(q.get("gbraid")) ?? clean(q.get("wbraid"));
  return attr.gclid || attr.utmSource || attr.utmCampaign ? attr : null;
}

export function serializeAttribution(attr: Attribution): string {
  const q = new URLSearchParams();
  if (attr.gclid) q.set("gclid", attr.gclid);
  if (attr.utmSource) q.set("utm_source", attr.utmSource);
  if (attr.utmCampaign) q.set("utm_campaign", attr.utmCampaign);
  return q.toString();
}

export function parseAttribution(value: string | undefined): Attribution | null {
  if (!value) return null;
  try {
    return readAttribution(decodeURIComponent(value));
  } catch {
    return readAttribution(value);
  }
}
