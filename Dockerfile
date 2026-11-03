# syntax=docker/dockerfile:1.7

# ---------- base ----------
FROM node:26-alpine AS base
# Keep in sync with "packageManager" in package.json (Node 26 has no corepack).
ARG PNPM_VERSION=12.16.1
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HUSKY=0 \
    CI=1
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app

# ---------- deps (full, for build) ----------
FROM base AS deps
RUN apk add --no-cache python3 make g++ libc6-compat
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- builder ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

# ---------- prod deps (no dev) ----------
FROM base AS prod-deps
RUN apk add --no-cache python3 make g++ libc6-compat
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ---------- runner ----------
FROM node:26-alpine AS runner
RUN apk add --no-cache dumb-init libstdc++ \
    && addgroup -S app && adduser -S app -G app

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS=--enable-source-maps

COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=builder   --chown=app:app /app/dist          ./dist
COPY --from=builder   --chown=app:app /app/drizzle        ./drizzle
COPY --from=builder   --chown=app:app /app/package.json   ./package.json
COPY --chown=app:app  scripts/entrypoint.sh               ./entrypoint.sh

RUN chmod +x ./entrypoint.sh

USER app

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--", "/app/entrypoint.sh"]
