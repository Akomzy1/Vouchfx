# VouchFX listener worker — long-lived GramJS MTProto client pool (read-only).
# Build context must be the REPO ROOT (pnpm workspace):
#   flyctl deploy . -c apps/listener/fly.toml

FROM node:22-bookworm

WORKDIR /app

# pnpm via corepack — version pinned by "packageManager" in package.json
RUN corepack enable

# Manifests first for dependency-layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/listener/package.json apps/listener/
COPY packages/config/package.json packages/config/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/

# Install the listener and its workspace dependencies only
RUN pnpm install --frozen-lockfile --filter @vouchfx/listener...

# Source — workspace packages resolve to TS via their package.json "main",
# so the worker runs under tsx (same as dev). Secrets come from Fly, never
# from baked-in .env files (excluded via .dockerignore).
COPY packages ./packages
COPY apps/listener ./apps/listener

WORKDIR /app/apps/listener
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
