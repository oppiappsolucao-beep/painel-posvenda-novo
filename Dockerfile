FROM node:22-alpine AS backend-build
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/index.html frontend/vite.config.ts frontend/tsconfig*.json ./
COPY frontend/public ./public
COPY frontend/src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache nginx
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=backend-build /app/dist ./dist
COPY --from=frontend-build /app/dist /usr/share/nginx/html
RUN mkdir -p /etc/nginx/http.d /etc/nginx/conf.d /run/nginx
COPY docker/nginx.conf /etc/nginx/http.d/default.conf
RUN cp /etc/nginx/http.d/default.conf /etc/nginx/conf.d/default.conf
COPY docker/start.sh /start.sh
RUN sed -i 's/\r$//' /start.sh && chmod +x /start.sh
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 80
CMD ["/start.sh"]
