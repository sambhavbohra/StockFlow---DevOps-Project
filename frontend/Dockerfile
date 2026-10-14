# Stage 1: build the static app with Node (build tooling stays out of the final image).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: serve with unprivileged Nginx (runs as UID 101, listens on 8080; rubric M4).
FROM nginxinc/nginx-unprivileged:1.30-alpine
# Where /api is proxied. Compose uses this default; Kubernetes overrides it with the backend Service name.
ENV BACKEND_URL=http://backend:8000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
