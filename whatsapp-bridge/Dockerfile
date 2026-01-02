FROM oven/bun:1

WORKDIR /usr/src/app

# Install dependencies first for layer caching
COPY package.json bun.lock* ./
RUN bun install --production

# Copy application code
COPY index.js ./

# Create session directory with proper permissions
RUN mkdir -p /data/whatsapp-session && chown -R bun:bun /data

USER bun
EXPOSE 3000/tcp

ENTRYPOINT ["bun", "run", "index.js"]
