FROM node:22-alpine AS build

WORKDIR /app

COPY .npmrc package*.json ./

RUN --mount=type=secret,id=GITHUB_TOKEN \
    GITHUB_TOKEN=$(cat /run/secrets/GITHUB_TOKEN) npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc


FROM node:22-alpine AS runtime

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3000
EXPOSE 50051

CMD ["node", "dist/index.js"]
