/**
 * Runs before the app becomes interactive (Next.js client instrumentation).
 * Its whole job is to notice browser errors that users hit but never report,
 * so they show up on /admin/traffic and inside the analysis bundle.
 */
import { EVENTS } from "@/lib/events";
import { flush, track } from "@/lib/track";

const MAX_PER_PAGE = 5;
let reported = 0;

function report(message: string, extra: Record<string, unknown> = {}) {
  if (reported >= MAX_PER_PAGE || !message) return;
  reported++;
  track(EVENTS.clientError, { props: { message: message.slice(0, 200), ...extra } });
}

try {
  window.addEventListener("error", (event) => {
    report(event.message || String(event.error ?? "error"), {
      source: (event.filename ?? "").slice(-80),
      line: event.lineno ?? 0,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    report(reason instanceof Error ? reason.message : String(reason ?? "unhandled rejection"), { kind: "promise" });
  });

  window.addEventListener("pagehide", () => flush());
} catch {
  /* instrumentation must never break the app */
}
