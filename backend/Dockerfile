FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

ENV PORT=3000
ENV CONFIG_PATH=/config/config.json
EXPOSE 3000

# Runs as root so the mounted Docker socket is accessible for the
# restart/logs diagnostics. This app is intended for a trusted LAN only.
CMD ["node", "src/index.js"]
