# syntax=docker/dockerfile:1
FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json ./
RUN pnpm install
COPY . .
RUN pnpm build

FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
