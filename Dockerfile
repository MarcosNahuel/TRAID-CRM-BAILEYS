FROM node:20-slim AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src/ ./src/
COPY tsconfig.json ./
RUN npx tsc

FROM node:20-slim
WORKDIR /app

# Herramientas que necesita Claude Code (Agent SDK spawna CLI como subprocess)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates ripgrep \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Claude Code CLI — necesario para `claude login` en el container
RUN npm install -g @anthropic-ai/claude-code

COPY --from=builder /app/dist ./dist/

# Directorio persistente para sesiones WhatsApp
RUN mkdir -p /data/sessions
VOLUME ["/data/sessions"]

# Directorio persistente para auth de Claude Code
RUN mkdir -p /root/.claude
VOLUME ["/root/.claude"]

EXPOSE 3001

CMD ["node", "dist/index.js"]
