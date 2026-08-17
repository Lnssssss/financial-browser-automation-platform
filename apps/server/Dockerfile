# syntax=docker/dockerfile:1
FROM node:20-slim AS build
WORKDIR /app
ENV PRISMA_ENGINES_MIRROR="https://registry.npmmirror.com/-/binary/prisma"

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json ./
RUN pnpm install
COPY prisma ./prisma
RUN pnpm prisma generate
COPY . .
RUN pnpm build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
EXPOSE 3000
# 启动前 push schema，再起服务（Stage 2 便捷做法；生产应改用 migrate deploy）
CMD sh -c "pnpm prisma db push --skip-generate && node dist/main.js"
