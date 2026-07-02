# Build context is the MONOREPO ROOT (see infrastructure/docker-compose.yml),
# not this folder, because this service depends on the shared
# @nyaticare/core-architecture workspace package.
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY apps/ussd-gateway/package.json apps/ussd-gateway/package.json
COPY packages/core-architecture/package.json packages/core-architecture/package.json

RUN npm install --no-audit --no-fund

COPY apps/ussd-gateway apps/ussd-gateway
COPY packages/core-architecture packages/core-architecture

RUN npm run build --workspace=@nyaticare/core-architecture
RUN npm run build --workspace=@nyaticare/ussd-gateway

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/core-architecture/dist ./packages/core-architecture/dist
COPY --from=builder /app/packages/core-architecture/package.json ./packages/core-architecture/package.json
COPY --from=builder /app/apps/ussd-gateway/dist ./apps/ussd-gateway/dist
COPY --from=builder /app/apps/ussd-gateway/package.json ./apps/ussd-gateway/package.json

EXPOSE 4004
CMD ["node", "apps/ussd-gateway/dist/index.js"]
