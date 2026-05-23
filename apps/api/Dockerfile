# apps/api/Dockerfile
# Build context = repo root (monorepo). Deploy with:
#   fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

# Install workspace deps (need lockfile + all manifests).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY infra ./infra

RUN pnpm install --frozen-lockfile

# Build the workspace libraries the API imports at runtime
# (@medspa/db and @medspa/shared resolve to their compiled dist).
RUN pnpm --filter @medspa/db build \
  && pnpm --filter @medspa/shared build

ENV NODE_ENV=production
EXPOSE 3001

# Deviation from guide §12.1: the guide ran `node apps/api/dist/server.js`,
# but the API uses extensionless ESM imports — run it via tsx instead
# (chosen runtime; matches dev).
CMD ["pnpm", "--filter", "@medspa/api", "start"]
