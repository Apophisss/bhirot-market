#!/bin/sh
# The clock for the hourly content refresh.
#
# On Vercel this was `vercel.json`'s cron entry; that file only means anything
# to Vercel, so the self-hosted deployment needs its own clock. This is it: a
# small container beside the app (see docker-compose.yml) that GETs
# /api/cron/refresh once an hour over the compose network. Everything the
# refresh actually does — syncing data/markets.json into the database and
# running the built-in question generator when ANTHROPIC_API_KEY is set — lives
# in that route.
#
# A loop here rather than a GitHub Actions `schedule:` on purpose: Actions'
# scheduler is best-effort and drops runs under load, and it would also have to
# reach the site over the public internet with the admin token in hand.
set -eu

INTERVAL=${CRON_INTERVAL_SECONDS:-3600}
TARGET=${CRON_TARGET:-http://app:3000/api/cron/refresh}

log() { echo "[cron-refresh] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

log "started — every ${INTERVAL}s against ${TARGET}"

while :; do
  # To the next boundary rather than a flat interval, so the run does not drift
  # by however long the generator took on the previous hour.
  sleep $(( INTERVAL - $(date +%s) % INTERVAL ))

  if [ -z "${CRON_SECRET:-}" ]; then
    # A valid state, not a failure: the route rejects every unauthenticated
    # call, so there is nothing to attempt until the token is configured.
    log "CRON_SECRET is not set, so there is nothing to call."
    continue
  fi

  # The generator can take minutes when it has web search to do, hence the
  # long timeout. The whole response is logged either way — `docker compose
  # logs cron` is where anyone will look when the questions stop updating.
  if body=$(curl -sS --fail-with-body --max-time 600 \
      "${TARGET}" -H "authorization: Bearer ${CRON_SECRET}"); then
    log "ok ${body}"
  else
    status=$?
    log "FAILED (curl exit ${status}) ${body:-no response}"
  fi
done
