import type { Metadata } from "next";
import Image from "next/image";
import { cookies } from "next/headers";
import { signIn, devLoginEnabled, googleEnabled, auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SITE_NAME } from "@/lib/config";
import { STARTING_BALANCE } from "@/lib/db/schema";
import { money } from "@/lib/format";
import { REFERRAL_BONUS } from "@/lib/referral";
import { AD_LANDING_COOKIE } from "@/lib/ad-attribution";
import { afterLoginPath } from "@/lib/after-login";
import { shareCard } from "@/lib/seo";
import { GuestAnswersRecap } from "@/components/GuestAnswersRecap";
import { GuestCopy } from "@/components/GuestCopy";
import { GoogleIcon } from "@/components/GoogleIcon";
import { LoginError } from "@/components/LoginError";

const LOGIN_DESCRIPTION = "הרשמה חינם בלחיצה אחת: 10,000 נקודות משחק, כל השאלות, טבלת מובילים וליגות עם חברים.";

export const dynamic = "force-dynamic";

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

  // Where the sign-in lands — the survey first for organic visitors, the deck straight
  // away for paid traffic, the ad-check marker either way — is decided in one place
  // (src/lib/after-login.ts), shared with the deck's own Google button.
  const fromAd = (await cookies()).has(AD_LANDING_COOKIE);
  const afterLogin = afterLoginPath(callbackUrl, fromAd);

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
            {/* a visitor mid-run was promised their answers are kept; that, not the site's
                currency, is the first thing the page says to them (see GuestCopy) */}
            <h1 className="text-xl font-extrabold text-text-strong sm:text-2xl">
              <GuestCopy template="לשמור את {n} התשובות — ולדעת אם צדקתם" fallback={`התחברות ל${SITE_NAME}`} />
            </h1>
            <p className="text-sm text-muted">
              <GuestCopy
                template={`חינם, בלחיצה אחת עם Google. התשובות נכנסות לניקוד, ואיתן ${money(STARTING_BALANCE)} להמשך.`}
                fallback={`חינם, בלחיצה אחת — ומקבלים ${money(STARTING_BALANCE)} לשחק בהן`}
              />
            </p>
          </div>
        </div>

        {/* whoever arrives here mid-run is told what they are about to claim, by name */}
        <GuestAnswersRecap />

        {error && <LoginError error={error} />}

        <div className="mt-6 space-y-3">
          {googleEnabled ? (
            <form action={google}>
              <button
                data-evt="login-google"
                className="tap pressable flex w-full items-center justify-center gap-3 rounded-xl border border-border-2 bg-white px-4 py-3.5 font-semibold text-gray-900 hover:bg-gray-100"
              >
                <GoogleIcon />
                <GuestCopy template="לשמור את התשובות עם Google" fallback="המשך עם Google" />
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

        {/*
          The two questions a stranger has on this screen, answered on this screen:
          what it costs (nothing — no card, no form, one Google button) and what it
          is for. Someone who got here off the deck has already seen that answering
          works; what they have not been told anywhere is that the rest of the game —
          the whole board, the table, leagues with friends, a portfolio — is on the
          other side of a click, and that the click is free.
        */}
        <ul className="mt-6 grid list-inside list-disc gap-1.5 text-[13px] leading-snug text-muted">
          <li>חינם לגמרי — בלי אשראי ובלי טופס, לחיצה אחת עם Google</li>
          <li>{money(STARTING_BALANCE)} משחק להתחיל איתן, ותשובות בלי הגבלה על כל הלוח</li>
          <li>טבלת מובילים, ליגות עם חברים, ותיק שמראה כמה שווה כל תשובה עכשיו</li>
          <li>{money(REFERRAL_BONUS)} על כל חבר/ה שמצטרפים בהזמנה שלכם</li>
        </ul>

        <p className="mt-6 text-xs leading-relaxed text-muted-2">
          בהתחברות אתם מאשרים שזהו משחק בנקודות בלבד, ללא כל ערך כספי. אנחנו שומרים רק שם, אימייל ותמונת פרופיל
          לצורך הצגת הדירוג והניקוד שלכם.
        </p>
      </div>
    </div>
  );
}
