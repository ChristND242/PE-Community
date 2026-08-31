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
ARG NEXT_PUBLIC_API_URL=/api/v1
ARG NEXT_PUBLIC_REALTIME_ORIGIN=
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_REALTIME_ORIGIN=${NEXT_PUBLIC_REALTIME_ORIGIN}

COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm --filter @pe/web build

FROM node:22-alpine AS runtime
ARG APP_VERSION=v0.0.0-dev
ARG SOURCE_COMMIT=development
ARG BUILD_DATE=unknown
WORKDIR /app
ENV NODE_ENV=production
ENV WEB_PORT=3000
ENV HOSTNAME=0.0.0.0
LABEL org.opencontainers.image.version=${APP_VERSION} \
      org.opencontainers.image.revision=${SOURCE_COMMIT} \
      org.opencontainers.image.created=${BUILD_DATE}

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
