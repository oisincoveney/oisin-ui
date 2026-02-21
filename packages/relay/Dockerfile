FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json tsconfig.json ./
COPY src ./src

RUN npm install
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/node-adapter.js"]
