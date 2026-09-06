"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";
import { EVENTS } from "@/lib/events";

/**
 * The sign-in page's error line, and the record that it was shown.
 *
 * `/login?error=…` is where Auth.js sends a failed round trip to Google. The page
 * displayed it and recorded nothing, so a visitor who pressed the button and came
 * back with an error was indistinguishable in the log from one who never pressed
 * it — on a phone, inside an in-app browser, that is a real and common way to lose
 * the very few paid visitors who get this far.
 */
export function LoginError({ error }: { error: string }) {
  useEffect(() => {
    track(EVENTS.loginError, { props: { error: error.slice(0, 60) } });
  }, [error]);
  return (
    <p className="mt-4 rounded-lg border border-no/40 bg-no/10 px-3 py-2 text-sm text-no">
      ההתחברות נכשלה ({error}). נסו שוב — ואם זה קורה מתוך אפליקציה, פתחו את הדף בדפדפן.
    </p>
  );
}
