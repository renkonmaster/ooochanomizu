FROM node:24.19.0-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# Downloads the hand model and copies WASM into dist during the build.
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24.19.0-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

USER node
EXPOSE 3000

CMD ["node", "dist-server/index.mjs"]
