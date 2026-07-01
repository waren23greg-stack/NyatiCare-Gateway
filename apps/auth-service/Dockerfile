# Build context is the MONOREPO ROOT (see infrastructure/docker-compose.yml),
# not this folder, because this service depends on the shared
# @nyaticare/core-architecture workspace package.
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY apps/auth-service/package.json apps/auth-service/package.json
COPY packages/core-architecture/package.json packages/core-architecture/package.json

RUN npm install --no-audit --no-fund

COPY apps/auth-service apps/auth-service
COPY packages/core-architecture packages/core-architecture

RUN npm run build --workspace=@nyaticare/core-architecture
RUN npm run build --workspace=@nyaticare/auth-service

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/core-architecture/dist ./packages/core-architecture/dist
COPY --from=builder /app/packages/core-architecture/package.json ./packages/core-architecture/package.json
COPY --from=builder /app/apps/auth-service/dist ./apps/auth-service/dist
COPY --from=builder /app/apps/auth-service/package.json ./apps/auth-service/package.json

EXPOSE 4001
CMD ["node", "apps/auth-service/dist/index.js"]
