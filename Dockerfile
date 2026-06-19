# HireQuick — single image for both the API and the worker (branch on PROCESS_TYPE).
# Railway uses this Dockerfile over Railpack/Nixpacks, giving full control of the
# pnpm-monorepo build.
FROM node:22-slim

# Prisma needs openssl at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.27.0 --activate

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile \
  && pnpm --filter @hq/database exec prisma generate \
  && pnpm --filter @hq/api build

# PROCESS_TYPE=worker runs the BullMQ worker; anything else runs the API.
CMD ["sh", "-c", "if [ \"$PROCESS_TYPE\" = \"worker\" ]; then pnpm --filter @hq/api worker:start; else pnpm --filter @hq/api start; fi"]
