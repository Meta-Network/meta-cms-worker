FROM node:16-bullseye AS builder
WORKDIR /opt/MetaNetwork/Worker
COPY .yarn ./.yarn
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable
COPY . .
RUN yarn run build
RUN yarn workspaces focus --production

FROM node:16-bullseye
WORKDIR /opt/MetaNetwork/Worker
COPY --from=builder /opt/MetaNetwork/Worker/dist ./dist
COPY --from=builder /opt/MetaNetwork/Worker/node_modules ./node_modules
ENV NODE_ENV=production
CMD ["--enable-source-maps","dist/main.js"]
