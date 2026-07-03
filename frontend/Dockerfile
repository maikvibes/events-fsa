# Built from the repo root context (not ./frontend alone) since the build's
# prebuild hook reaches up to ../scripts/generate-sw.mjs.
FROM node:22-alpine AS builder
WORKDIR /app
COPY scripts/generate-sw.mjs ./scripts/generate-sw.mjs
COPY frontend/package.json frontend/package-lock.json ./frontend/
WORKDIR /app/frontend
RUN npm ci
COPY frontend ./

# Vite bakes these into the static bundle at build time, so they're ARGs, not
# runtime env — placeholder defaults keep the build green without real
# Firebase web-push credentials configured; override with --build-arg (or
# real repo secrets, once set up) for working push notifications.
ARG VITE_API_BASE_URL=http://157.180.69.127:3000/api/v1
ARG VITE_FIREBASE_API_KEY=placeholder-api-key
ARG VITE_FIREBASE_AUTH_DOMAIN=placeholder.firebaseapp.com
ARG VITE_FIREBASE_PROJECT_ID=placeholder-project
ARG VITE_FIREBASE_STORAGE_BUCKET=placeholder.firebasestorage.app
ARG VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
ARG VITE_FIREBASE_APP_ID=1:000000000000:web:0000000000000000000000
ARG VITE_FIREBASE_MEASUREMENT_ID=G-0000000000
RUN printf '%s\n' \
      "VITE_API_BASE_URL=$VITE_API_BASE_URL" \
      "VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY" \
      "VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN" \
      "VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID" \
      "VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET" \
      "VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID" \
      "VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID" \
      "VITE_FIREBASE_MEASUREMENT_ID=$VITE_FIREBASE_MEASUREMENT_ID" \
      > .env && \
    npm run build

FROM nginx:alpine AS runner
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
