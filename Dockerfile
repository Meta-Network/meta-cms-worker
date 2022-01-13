FROM ghcr.io/biscuittin/node:14-impish AS builder
WORKDIR /opt/MetaNetwork/Worker
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn run build
RUN npm prune --production

FROM ghcr.io/biscuittin/node:14-impish
WORKDIR /opt/MetaNetwork/Worker
COPY --from=builder /opt/MetaNetwork/Worker/dist ./dist
COPY --from=builder /opt/MetaNetwork/Worker/node_modules ./node_modules
CMD ["--enable-source-maps","--prof","--logfile=/tmp/worker-git-v8.log","dist/main.js"]
