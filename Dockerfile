FROM node:20-slim AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src/ ./src/
COPY tsconfig.json ./
RUN npx tsc

FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist/

# Directorio persistente para sesiones WhatsApp
RUN mkdir -p /data/sessions
VOLUME ["/data/sessions"]

EXPOSE 3001

CMD ["node", "dist/index.js"]
