"use server";

import { cookies } from "next/headers";
import { signIn } from "@/lib/auth";
import { AD_LANDING_COOKIE } from "@/lib/ad-attribution";
import { afterLoginPath } from "@/lib/after-login";

/**
 * "המשך עם Google", callable from anywhere — not only from /login.
 *
 * Until now the one place a Google sign-in could start was the inline action on the
 * sign-in page, so every ask on the deck (the guest banner, the wall at the end of
 * the free run) was a navigation to another page whose headline said "התחברות". The
 * deck now carries the button itself: the form posts here with the page to come back
 * to, and the destination is decided exactly as the sign-in page decides it.
 */
export async function signInWithGoogle(formData: FormData) {
  const callbackUrl = String(formData.get("callbackUrl") ?? "");
  const fromAd = (await cookies()).has(AD_LANDING_COOKIE);
  await signIn("google", { redirectTo: afterLoginPath(callbackUrl, fromAd) });
}
