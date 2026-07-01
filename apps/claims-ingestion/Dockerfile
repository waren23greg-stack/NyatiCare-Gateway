# Build context is the MONOREPO ROOT (see infrastructure/docker-compose.yml),
# not this folder, because this service depends on the shared
# @nyaticare/core-architecture workspace package.
FROM node:20-alpine AS builder
WORKDIR /app

# better-sqlite3 is a native module and needs a build toolchain to compile
RUN apk add --no-cache python3 make g++

COPY package.json ./
COPY apps/claims-ingestion/package.json apps/claims-ingestion/package.json
COPY packages/core-architecture/package.json packages/core-architecture/package.json

RUN npm install --no-audit --no-fund

COPY apps/claims-ingestion apps/claims-ingestion
COPY packages/core-architecture packages/core-architecture

RUN npm run build --workspace=@nyaticare/core-architecture
RUN npm run build --workspace=@nyaticare/claims-ingestion

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# node_modules ships better-sqlite3's compiled native binding, so it must
# come from the SAME alpine build that compiled it, not be reinstalled here.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/core-architecture/dist ./packages/core-architecture/dist
COPY --from=builder /app/packages/core-architecture/package.json ./packages/core-architecture/package.json
COPY --from=builder /app/apps/claims-ingestion/dist ./apps/claims-ingestion/dist
COPY --from=builder /app/apps/claims-ingestion/package.json ./apps/claims-ingestion/package.json

RUN mkdir -p /app/data
EXPOSE 4002
CMD ["node", "apps/claims-ingestion/dist/index.js"]
