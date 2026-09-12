# Comment-only rebuild marker for the workers image.
FROM oven/bun:1 AS base

ARG MACRO_VERSION=dev
ARG GIT_SHA=unknown

LABEL org.opencontainers.image.title="Macro websocket service" \
      org.opencontainers.image.source="https://github.com/KevinLaucn/macro-docker" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.version="${MACRO_VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}"

WORKDIR /app

COPY services/websocket-service/package.json services/websocket-service/bun.lock* ./
RUN bun install --frozen-lockfile

COPY services/websocket-service/ .

EXPOSE 6969

CMD ["bun", "run", "start"]
