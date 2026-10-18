# LinX Web image: the built static bundle baked into the same unprivileged nginx the
# production linx-web Deployment runs. Built by .github/workflows/candidate.yml from
# apps/web/dist; promoted to production by digest, never rebuilt.
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Links the GHCR package to this (public) repository; the cluster pulls the image from ghcr.io.
LABEL org.opencontainers.image.source="https://github.com/undefinedsco/LinX"

COPY deploy/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/dist /usr/share/nginx/html

EXPOSE 8080
