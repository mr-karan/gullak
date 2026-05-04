FROM oven/bun:1.1-debian AS install

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.1-debian

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV GULLAK_HOST=0.0.0.0 \
  GULLAK_PORT=8787 \
  GULLAK_DB_PATH=/data/gullak.db

COPY --from=install /app/node_modules ./node_modules
COPY package.json drizzle.config.ts tsconfig.json ./
COPY src ./src
COPY drizzle ./drizzle

VOLUME ["/data"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:8787/v1/health || exit 1

CMD ["bun", "run", "src/index.ts"]
