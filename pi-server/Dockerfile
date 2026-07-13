FROM node:22-bookworm-slim AS install

WORKDIR /app

# Build toolchain for native modules (better-sqlite3, pulled by @actual-app/api
# and used by the Drizzle better-sqlite3 driver). Lives only in this stage; the
# final image copies just the built node_modules.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production \
  CHAVANNI_HOST=0.0.0.0 \
  CHAVANNI_PORT=8787 \
  CHAVANNI_DB_PATH=/data/chavanni.db

COPY --from=install /app/node_modules ./node_modules
COPY package.json drizzle.config.ts tsconfig.json ./
COPY src ./src
COPY drizzle ./drizzle

VOLUME ["/data"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:8787/v1/health || exit 1

# tsx runs the TypeScript sources directly (the code uses .ts extension imports);
# it's a regular dependency so it survives `npm ci --omit=dev`.
CMD ["node_modules/.bin/tsx", "src/index.ts"]
