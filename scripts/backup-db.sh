#!/bin/sh
# The nightly copy of the database. Until this existed there was none.
#
# Every account, balance, position and answer lives in one SQLite file inside
# one Docker volume on one droplet. A bad migration, a lost droplet or a stray
# `docker compose down -v` took all of it with no way back — the image is
# rebuilt on every deploy and the volume is not, which is exactly what makes the
# volume the single copy of everything users did here.
#
# `sqlite3 .backup` and not `cp`: the database runs in WAL mode, so the file on
# disk is only part of the state and copying it while the app is writing yields
# a database that opens and is missing the last transactions — or does not open
# at all. `.backup` uses SQLite's online backup API, which takes a consistent
# snapshot of a live database without stopping the app.
#
# Runs as its own container beside the app (docker-compose.yml), on the same
# shape as `cron`/`drift`: one loop, one job, and no application secrets.
#
# ── Restoring ────────────────────────────────────────────────────────────────
# Verified against a real database before this was committed (a copy taken while
# writes were in flight restores, passes integrity_check and holds every row).
#
#   docker compose stop app
#   docker compose run --rm --entrypoint sh backup -c \
#     'gunzip -c /backups/bhirot-<stamp>.db.gz > /data/restore.db \
#      && sqlite3 /data/restore.db "pragma integrity_check;" \
#      && mv /data/bhirot.db /data/bhirot.db.broken \
#      && mv /data/restore.db /data/bhirot.db \
#      && rm -f /data/bhirot.db-wal /data/bhirot.db-shm'
#   docker compose start app          # then check /api/health
#
# Deleting the old -wal/-shm files is not optional: they belong to the database
# that was just moved aside, and SQLite would either refuse the pair or replay
# the wrong log over the restored file.
#
# ── What is still missing ────────────────────────────────────────────────────
# These copies sit on the same droplet as the database they protect, so they
# survive a bad migration and not a lost machine. Off-site storage needs
# credentials only the owner can issue (a DO Spaces bucket plus a key/secret);
# when they exist, the upload belongs at the end of `backup_once` below.
set -eu

DB_PATH=${BACKUP_DB_PATH:-/data/bhirot.db}
BACKUP_DIR=${BACKUP_DIR:-/backups}
# Fourteen nights: long enough that a corruption noticed on a Monday can be
# undone with a copy from before it, short enough to stay small on a droplet.
KEEP=${BACKUP_KEEP:-14}
INTERVAL=${BACKUP_INTERVAL_SECONDS:-86400}

log() { echo "[backup-db] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

# Alpine ships without the SQLite CLI and there is no official sqlite image to
# pin instead, so it is installed once at start. A failure here is fatal on
# purpose: a backup container that cannot take a backup must be loud, not idle.
if ! command -v sqlite3 >/dev/null 2>&1; then
  log "installing the sqlite client"
  apk add --no-cache sqlite >/dev/null || {
    log "FATAL: could not install sqlite3"
    exit 1
  }
fi

backup_once() {
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  tmp="${BACKUP_DIR}/.bhirot-${stamp}.db"
  out="${BACKUP_DIR}/bhirot-${stamp}.db.gz"

  if [ ! -f "$DB_PATH" ]; then
    log "FAILED: ${DB_PATH} does not exist"
    return 1
  fi

  # `.timeout` rather than a bare `.backup`: the app holds write locks in bursts
  # (a trade, the hourly sync), and the backup should wait for them instead of
  # failing the night on a busy second.
  if ! sqlite3 "$DB_PATH" ".timeout 15000" ".backup '${tmp}'"; then
    log "FAILED: .backup did not complete"
    rm -f "$tmp"
    return 1
  fi

  # A backup nobody has opened is a guess. Every copy is checked here, in the
  # same run that made it, so a file that cannot be restored is known tonight
  # and not on the morning it is needed.
  if ! sqlite3 "$tmp" "pragma integrity_check;" | grep -qx "ok"; then
    log "FAILED: the copy did not pass integrity_check"
    rm -f "$tmp"
    return 1
  fi
  users=$(sqlite3 "$tmp" "select count(*) from user;" 2>/dev/null || echo "?")
  trades=$(sqlite3 "$tmp" "select count(*) from trade;" 2>/dev/null || echo "?")

  gzip -9 -c "$tmp" > "$out"
  rm -f "$tmp"
  log "ok ${out} ($(wc -c < "$out") bytes, ${users} users, ${trades} trades)"
}

prune() {
  # Newest first, keep KEEP, delete the rest. `ls -1` is enough because the
  # stamp is ISO-ordered, so alphabetical order is chronological order.
  count=$(ls -1 "${BACKUP_DIR}"/bhirot-*.db.gz 2>/dev/null | wc -l)
  if [ "$count" -le "$KEEP" ]; then
    return 0
  fi
  ls -1 "${BACKUP_DIR}"/bhirot-*.db.gz | sort | head -n $((count - KEEP)) | while read -r old; do
    rm -f "$old"
    log "pruned ${old}"
  done
}

mkdir -p "$BACKUP_DIR"
log "started — every ${INTERVAL}s from ${DB_PATH} into ${BACKUP_DIR}, keeping ${KEEP}"

# One copy at start, so a fresh container proves it can back up now rather than
# in twenty-four hours, and so the first deploy leaves a file behind.
backup_once || true
prune

while :; do
  # To the next boundary rather than a flat interval, so the copy lands at the
  # same hour every night whenever the container was last restarted.
  sleep $(( INTERVAL - $(date +%s) % INTERVAL ))
  backup_once || true
  prune
done
