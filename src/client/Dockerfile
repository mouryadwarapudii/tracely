# Tracely dashboard + ingest API. Build from this directory: docker build -t tracely src/client
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 TRACELY_DATA_DIR=/app/data
RUN addgroup -S tracely && adduser -S tracely -G tracely && mkdir -p /app/data && chown tracely:tracely /app/data
COPY --from=build --chown=tracely:tracely /app/.next/standalone ./
COPY --from=build --chown=tracely:tracely /app/.next/static ./.next/static
COPY --from=build --chown=tracely:tracely /app/public ./public
USER tracely
EXPOSE 3000
VOLUME /app/data
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
