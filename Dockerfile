# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
# libc6-compat for the native @libsql bindings; openssl so the entrypoint and
# the image can generate/inspect keys on a musl base that ships neither.
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# ---------- dependencies ----------
FROM base AS deps
COPY package.json package-lock.json ./
# Installed on alpine so npm resolves the musl build of the libSQL client; the
# glibc one loads on a runner and then fails at boot inside this image.
RUN npm ci

# ---------- build ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Nothing is prerendered — every route is force-dynamic — so the build never
# opens this. It only has to be a syntactically valid libSQL URL.
ENV DATABASE_URL="file:/tmp/build.db"
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* is inlined into the client bundle at build time, so the public
# origin has to be known here and not just in the server's .env. Getting it
# wrong ships absolute links and share metadata pointing at localhost.
ARG NEXT_PUBLIC_SITE_URL="http://localhost:3000"
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN npm run build

# ---------- runtime ----------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# src/lib/db reads the migrations off disk at boot, from a path built with
# process.cwd(). next.config.ts asks the tracer for them too, but this copy is
# the one that is guaranteed: without the folder every request 500s on a
# migration error rather than on anything that names the cause.
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && mkdir -p /data && chown nextjs:nodejs /data

USER nextjs
EXPOSE 3000
VOLUME ["/data"]

# /api/health syncs data/markets.json into the database on its first call and
# is memoised after that, so this doubles as the "the site is really up" probe
# the deploy waits on.
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
