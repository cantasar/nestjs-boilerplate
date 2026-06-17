# syntax=docker/dockerfile:1.7

# ---------- base ----------
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HUSKY=0 \
    CI=1
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
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
FROM node:24-alpine AS runner
RUN apk add --no-cache dumb-init libstdc++ \
    && addgroup -S app && adduser -S app -G app

WORKDIR /app

# Sentry release tag — pass --build-arg GIT_SHA=$COMMIT_SHA from CI (optional).
ARG GIT_SHA=""

ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS=--enable-source-maps \
    SENTRY_RELEASE=$GIT_SHA

COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=builder   --chown=app:app /app/dist          ./dist
COPY --from=builder   --chown=app:app /app/drizzle        ./drizzle
COPY --from=builder   --chown=app:app /app/package.json   ./package.json
COPY --chown=app:app  scripts/entrypoint.sh               ./entrypoint.sh

RUN chmod +x ./entrypoint.sh

USER app

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--", "/app/entrypoint.sh"]
