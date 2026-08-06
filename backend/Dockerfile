FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

ENV PORT=3000
ENV CONFIG_PATH=/config/config.json
# Docker's bridge advertises IPv6 routes the host can't actually deliver, and
# Node's happy-eyeballs autoselection then times out intermittently (ETIMEDOUT
# on fetch, e.g. TMDb). Plain IPv4 connects are reliable, so turn it off.
ENV NODE_OPTIONS=--no-network-family-autoselection
EXPOSE 3000

# Runs as root so the mounted Docker socket is accessible for the
# restart/logs diagnostics. This app is intended for a trusted LAN only.
CMD ["node", "src/index.js"]
