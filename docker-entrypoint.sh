#!/bin/sh
set -eu

echo "[entrypoint] uid=$(id -u) gid=$(id -g) node=$(node -v)"
echo "[entrypoint] DATABASE_URL=${DATABASE_URL:-<unset>}"

# Drizzle applies the migrations from inside the app on the first query (see
# src/lib/db/index.ts), so there is no migrate step here. What there is, is the
# check that would otherwise surface as a migration stack trace on the first
# request: a mounted volume the non-root user cannot write to.
case "${DATABASE_URL:-}" in
  file:*)
    db_path=${DATABASE_URL#file:}
    db_dir=$(dirname "$db_path")
    if [ ! -d "$db_dir" ]; then
      echo "[entrypoint] FATAL: $db_dir does not exist" >&2
      exit 1
    fi
    if [ ! -w "$db_dir" ]; then
      echo "[entrypoint] FATAL: $db_dir is not writable by uid $(id -u)" >&2
      ls -ld "$db_dir" >&2 || true
      exit 1
    fi
    ;;
esac

# Auth.js refuses to sign anything without this, and it fails per-request
# rather than at boot — so a container with no AUTH_SECRET looks healthy right
# up until someone tries to log in.
if [ -z "${AUTH_SECRET:-}" ]; then
  echo "[entrypoint] WARNING: AUTH_SECRET is not set — logins will fail." >&2
fi
# The passwordless dev login creates an account for any name typed into it.
if [ "${ALLOW_DEV_LOGIN:-}" = "true" ]; then
  echo "[entrypoint] WARNING: ALLOW_DEV_LOGIN=true — anyone can sign in without a password." >&2
fi

echo "[entrypoint] starting server on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
exec "$@"
