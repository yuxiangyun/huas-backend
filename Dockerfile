FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY src/ src/
COPY drizzle.config.ts tsconfig.json ./

# Data & log directories
RUN mkdir -p data logs

EXPOSE 3000

ENV NODE_ENV=production \
    TIMEZONE=Asia/Shanghai \
    TZ=Asia/Shanghai

CMD ["bun", "run", "src/index.ts"]
