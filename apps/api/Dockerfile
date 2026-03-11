FROM node:20-alpine AS base

WORKDIR /repo

RUN corepack enable

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# copiar archivos del workspace
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# descargar dependencias (cacheable)
RUN pnpm fetch

# -------- install stage --------

FROM base AS deps

COPY . .

RUN pnpm install --offline --frozen-lockfile

# -------- runtime --------

FROM node:20-alpine

WORKDIR /app

RUN corepack enable

COPY --from=deps /repo /app

WORKDIR /app/apps/api

EXPOSE 4000

CMD ["pnpm","dev"]