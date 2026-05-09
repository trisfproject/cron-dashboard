FROM node:22-alpine AS deps
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install

FROM node:22-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_APP_VERSION
ARG NEXT_PUBLIC_GIT_HASH
ARG NEXT_PUBLIC_APP_ENV
ARG NEXT_PUBLIC_BUILD_TIMESTAMP
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
ENV NEXT_PUBLIC_GIT_HASH=$NEXT_PUBLIC_GIT_HASH
ENV NEXT_PUBLIC_APP_ENV=$NEXT_PUBLIC_APP_ENV
ENV NEXT_PUBLIC_BUILD_TIMESTAMP=$NEXT_PUBLIC_BUILD_TIMESTAMP
COPY package.json ./package.json
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
COPY frontend ./frontend
WORKDIR /app/frontend
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/frontend/public ./public
COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
