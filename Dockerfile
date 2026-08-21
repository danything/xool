FROM oven/bun:1.4.0-slim AS base
WORKDIR /usr/src/app
EXPOSE 3000
ENV BODY_SIZE_LIMIT=100M

FROM base AS builder
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN bun i --frozen-lockfile
COPY . .
# Declared after the source copy so it can't invalidate the dependency layers.
# Stamps the build into version.json, which open tabs poll to spot a rollout.
ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION
RUN bun run build

FROM base AS prod-deps
COPY package.json bun.lock ./
RUN bun i --frozen-lockfile --production

FROM base
RUN mkdir -p data && chown bun:bun data
USER bun
COPY --from=prod-deps --chown=bun:bun /usr/src/app/node_modules ./node_modules
COPY --from=builder   --chown=bun:bun /usr/src/app/package.json ./package.json
COPY --from=builder   --chown=bun:bun /usr/src/app/build ./build
# The served asset directory is a volume shared with the other pod during a
# rollout, so this build's own copy is kept outside it and merged in at start.
# Copied from the builder rather than duplicated here: WORKDIR belongs to root
# and this stage has already dropped to bun.
COPY --from=builder --chown=bun:bun /usr/src/app/build/client/_app/immutable ./immutable-src
COPY --chmod=0755 docker-entrypoint.sh /usr/local/bin/xool-start
# Serves the shared asset directory itself, ahead of SvelteKit. See server.js.
COPY --chown=bun:bun server.js ./build/server.js
ENTRYPOINT [ "/usr/local/bin/xool-start" ]
CMD [ "build/server.js" ]
