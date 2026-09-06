"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { readGuestAnswers, serverGuestAnswers, subscribeGuestAnswers } from "@/lib/rapid-guest";

/**
 * A line of copy that changes once the browser holds answers given before sign-in.
 *
 * The sign-in page is rendered on the server and cannot see the browser store, so its
 * headline and button used to sell the same thing to everyone: an account and 10,000
 * points. A visitor arriving mid-run was promised something else by the button they
 * just pressed — that their answers are kept — and the page's first words should be
 * about that. `template` is used when there are answers, with `{n}` replaced by how
 * many; `fallback` is what everyone else reads, and what the server renders.
 */
export function GuestCopy({ template, fallback }: { template: string; fallback: ReactNode }) {
  const answers = useSyncExternalStore(subscribeGuestAnswers, readGuestAnswers, serverGuestAnswers);
  if (!answers.length) return <>{fallback}</>;
  return <>{template.replace("{n}", String(answers.length))}</>;
}
