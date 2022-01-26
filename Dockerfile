FROM node:16-bullseye AS builder
WORKDIR /opt/MetaNetwork/Worker
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn run build
RUN npm prune --production

FROM node:16-bullseye
WORKDIR /opt/MetaNetwork/Worker
COPY --from=builder /opt/MetaNetwork/Worker/dist ./dist
COPY --from=builder /opt/MetaNetwork/Worker/node_modules ./node_modules
ENV NODE_ENV=production
CMD ["--enable-source-maps","dist/main.js"]
