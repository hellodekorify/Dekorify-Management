# Builds the app in "Dekorify App/" from the repository root, so Railway can
# deploy this repo without a Root Directory setting.
FROM node:22-bookworm-slim

# Prisma's query engine needs OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ["Dekorify App/package.json", "Dekorify App/package-lock.json", "./"]
COPY ["Dekorify App/prisma", "./prisma"]
RUN npm ci --no-audit --no-fund

COPY ["Dekorify App/", "./"]

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Defaults point at a Railway volume mounted at /data. Override in Railway's
# Variables if you mount it elsewhere or use PostgreSQL.
ENV NODE_ENV=production \
    DATABASE_URL="file:/data/dekorify.db" \
    STORAGE_DIR="/data/storage" \
    PORT=3000

RUN mkdir -p /data/storage

EXPOSE 3000
CMD ["npm", "run", "start:railway"]
