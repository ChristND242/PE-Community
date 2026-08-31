# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/updater/package.json apps/updater/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY prisma ./prisma
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm db:generate
RUN pnpm --filter @pe/worker build

FROM node:22-alpine AS runtime
ARG APP_VERSION=v0.0.0-dev
ARG SOURCE_COMMIT=development
ARG BUILD_DATE=unknown
WORKDIR /app
ENV NODE_ENV=production
LABEL org.opencontainers.image.version=${APP_VERSION} \
      org.opencontainers.image.revision=${SOURCE_COMMIT} \
      org.opencontainers.image.created=${BUILD_DATE}

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/packages/shared ./packages/shared

CMD ["node", "apps/worker/dist/main.js"]
