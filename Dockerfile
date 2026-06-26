FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG SERVICE_NAME
RUN if [ -f "apps/${SERVICE_NAME}/prisma/schema.prisma" ]; then \
      npx prisma generate --schema=apps/${SERVICE_NAME}/prisma/schema.prisma && \
      cp -r apps/${SERVICE_NAME}/prisma /tmp/prisma-dir; \
    else \
      mkdir -p /tmp/prisma-dir; \
    fi && \
    npx nest build ${SERVICE_NAME}

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
ARG SERVICE_NAME
COPY --from=builder /app/dist/apps/${SERVICE_NAME} ./dist
CMD ["node", "dist/main"]
