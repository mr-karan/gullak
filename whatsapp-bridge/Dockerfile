FROM oven/bun:1.3-debian AS install

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3-debian

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PORT=3000 \
  STORE_DB_PATH=/data/whatsapp.db

COPY --from=install /app/node_modules ./node_modules
COPY package.json index.js store.js ./

VOLUME ["/data"]
EXPOSE 3000/tcp

CMD ["bun", "run", "index.js"]
