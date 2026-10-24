FROM oven/bun:1.4.4-slim AS base
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

# The runtime stage has no shell, so the directory the PVC mounts over is made
# here and copied across with the owner it needs.
RUN mkdir -p /out/data

# Distroless Bun: no shell or package manager, only the runtime and the glibc,
# CA certificates and tzdata it needs. Runs as 1000:1000, the uid of the slim
# image's bun user, so the existing PVC stays writable.
FROM oven/bun:1.4.4-distroless
WORKDIR /usr/src/app
EXPOSE 3000
ENV BODY_SIZE_LIMIT=100M
USER 1000:1000
COPY --from=prod-deps --chown=1000:1000 /out/ ./
COPY --from=prod-deps --chown=1000:1000 /usr/src/app/node_modules ./node_modules
COPY --from=builder   --chown=1000:1000 /usr/src/app/package.json ./package.json
COPY --from=builder   --chown=1000:1000 /usr/src/app/build ./build
# The entrypoint is bun itself (the base image's too); spelled out so CMD is
# only the arguments.
ENTRYPOINT ["/usr/local/bin/bun"]
CMD ["build/index.js"]
