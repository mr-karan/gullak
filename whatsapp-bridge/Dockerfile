FROM node:20-bookworm-slim

WORKDIR /usr/src/app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile

COPY index.js ./

RUN mkdir -p /data/whatsapp-session

EXPOSE 3000/tcp

CMD ["node", "index.js"]
