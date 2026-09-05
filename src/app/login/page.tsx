import type { Metadata } from "next";
import Image from "next/image";
import { cookies } from "next/headers";
import { signIn, devLoginEnabled, googleEnabled, auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SITE_NAME } from "@/lib/config";
import { STARTING_BALANCE } from "@/lib/db/schema";
import { money } from "@/lib/format";
import { AD_CHECK_PARAM, AD_LANDING_COOKIE } from "@/lib/ad-attribution";
import { shareCard } from "@/lib/seo";

const LOGIN_DESCRIPTION = "התחברו וקבלו 10,000 נקודות למשחק הניחושים של בחירות 2026.";

export const dynamic = "force-dynamic";

/**
 * Tells `<AdConversions>` to ask for the sign_up conversion on the way back from the
 * login provider. Wherever the post-login destination moves to, the marker moves with
 * it — a destination that loses it reports no signup, and says nothing about it.
 */
function withAdCheck(path: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${AD_CHECK_PARAM}=1`;
}

export const metadata: Metadata = {
  title: "התחברות",
  description: LOGIN_DESCRIPTION,
  alternates: { canonical: "/login" },
  robots: { index: false, follow: true },
  ...shareCard({ title: `התחברות | ${SITE_NAME}`, description: LOGIN_DESCRIPTION, path: "/login" }),
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const { callbackUrl, error } = await searchParams;
  // no callbackUrl means the visitor came to /login on its own — the deck is where a
  // new account with a full balance and no answers has something to do
  const redirectTo = callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/rapid";
  const session = await auth();
  if (session?.user) redirect(redirectTo);

  // Organic visitors land on the short survey first; it forwards to `redirectTo`
  // immediately for anyone who already answered it, so a returning user never sees
  // it twice.
  //
  // Paid traffic skips it. The survey asks before it gives, and someone who clicked
  // an ad thirty seconds ago has no reason to spend a whole screen on preferences
  // before seeing that the product works at all — every screen between the click and
  // the first trade is paid for. Nothing is lost by skipping: the deck offers the same
  // survey on arrival (`shouldOfferSurvey()` → `<SurveyPrompt>` in app/rapid/page.tsx).
  const fromAd = (await cookies()).has(AD_LANDING_COOKIE);
  const afterLogin = withAdCheck(
    fromAd || redirectTo.startsWith("/onboarding") ? redirectTo : `/onboarding?next=${encodeURIComponent(redirectTo)}`,
  );

  async function google() {
    "use server";
    await signIn("google", { redirectTo: afterLogin });
  }
  async function dev(formData: FormData) {
    "use server";
    await signIn("dev", { name: String(formData.get("name") ?? ""), redirectTo: afterLogin });
  }

  return (
    <div className="mx-auto mt-4 max-w-md sm:mt-10">
      <div className="card p-5 sm:p-8">
        <div className="flex items-center gap-3">
          <Image src="/logo.svg" alt="" width={44} height={44} />
          <div>
            <h1 className="text-xl font-extrabold text-text-strong sm:text-2xl">התחברות ל{SITE_NAME}</h1>
            <p className="text-sm text-muted">מקבלים {money(STARTING_BALANCE)} ומתחילים לנחש</p>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-no/40 bg-no/10 px-3 py-2 text-sm text-no">
            ההתחברות נכשלה ({error}). נסו שוב.
          </p>
        )}

        <div className="mt-6 space-y-3">
          {googleEnabled ? (
            <form action={google}>
              <button className="tap pressable flex w-full items-center justify-center gap-3 rounded-xl border border-border-2 bg-white px-4 py-3.5 font-semibold text-gray-900 hover:bg-gray-100">
                <GoogleIcon />
                המשך עם Google
              </button>
            </form>
          ) : (
            <div className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-text">
              <strong>התחברות עם Google עדיין לא הוגדרה.</strong>
              <p className="mt-1 text-muted">
                הוסיפו <code className="rounded bg-surface-2 px-1">AUTH_GOOGLE_ID</code> ו־<code className="rounded bg-surface-2 px-1">AUTH_GOOGLE_SECRET</code> לקובץ הסביבה
                (ראו README).
              </p>
            </div>
          )}

          {devLoginEnabled && (
            <form action={dev} className="rounded-xl border border-dashed border-border-2 p-4">
              <p className="mb-2 text-xs font-semibold text-muted">כניסה מהירה לפיתוח (ללא סיסמה)</p>
              <div className="flex gap-2">
                <input
                  name="name"
                  required
                  placeholder="שם לתצוגה"
                  className="tap min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-base outline-none focus:border-accent sm:text-sm"
                />
                <button className="tap pressable shrink-0 rounded-lg bg-surface-3 px-4 text-sm font-semibold hover:bg-border-2">כניסה</button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-6 text-xs leading-relaxed text-muted-2">
          בהתחברות אתם מאשרים שזהו משחק בנקודות בלבד, ללא כל ערך כספי. אנחנו שומרים רק שם, אימייל ותמונת פרופיל
          לצורך הצגת הדירוג והניקוד שלכם.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.4 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4.1-13.6-9.9l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
