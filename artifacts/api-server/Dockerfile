# Cloud PHP Lab API - Node + PHP for script execution
FROM node:20-bookworm-slim

# Install PHP CLI (needed for executing user PHP scripts)
RUN apt-get update && apt-get install -y --no-install-recommends php-cli \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY lib ./lib
COPY artifacts/api-server ./artifacts/api-server
COPY tsconfig.json tsconfig.base.json ./

# Install deps and build
RUN corepack enable pnpm && pnpm install --frozen-lockfile
RUN pnpm --filter "@workspace/api-server" build

# Create workspaces dir for user project files
RUN mkdir -p /app/workspaces

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "artifacts/api-server/dist/index.cjs"]
