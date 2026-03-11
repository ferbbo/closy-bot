FROM node:20-alpine AS base

WORKDIR /repo

RUN corepack enable

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

RUN pnpm fetch

FROM base AS deps

COPY . .

RUN pnpm install --offline --frozen-lockfile

FROM node:20-alpine

WORKDIR /app

RUN corepack enable

COPY --from=deps /repo /app

WORKDIR /app/apps/dashboard

EXPOSE 3000

CMD ["pnpm","dev:dashboard"]