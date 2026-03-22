FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install typescript

COPY src/ ./src/
COPY tsconfig.json ./

RUN npx tsc

EXPOSE 3000

CMD ["node", "dist/index.js"]
