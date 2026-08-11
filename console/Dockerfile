FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Accept NEXT_PUBLIC_* vars at build time so Next.js bakes them into the bundle.
# Set these in Railway (or any CI) before the build step.
ARG NEXT_PUBLIC_OKTA_DOMAIN
ARG NEXT_PUBLIC_OKTA_ISSUER
ARG NEXT_PUBLIC_P3_OKTA_CLIENT_ID
ARG NEXT_PUBLIC_P5_OKTA_CLIENT_ID
ARG NEXT_PUBLIC_P6_AGENT_URL
ENV NEXT_PUBLIC_OKTA_DOMAIN=$NEXT_PUBLIC_OKTA_DOMAIN
ENV NEXT_PUBLIC_OKTA_ISSUER=$NEXT_PUBLIC_OKTA_ISSUER
ENV NEXT_PUBLIC_P3_OKTA_CLIENT_ID=$NEXT_PUBLIC_P3_OKTA_CLIENT_ID
ENV NEXT_PUBLIC_P5_OKTA_CLIENT_ID=$NEXT_PUBLIC_P5_OKTA_CLIENT_ID
ENV NEXT_PUBLIC_P6_AGENT_URL=$NEXT_PUBLIC_P6_AGENT_URL

RUN rm -f .env.local && touch .env.local
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
