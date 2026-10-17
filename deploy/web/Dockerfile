# LinX Web image: the built static bundle baked into the same unprivileged nginx the
# production linx-web Deployment runs. Built by .github/workflows/candidate.yml from
# apps/web/dist; promoted to production by digest, never rebuilt.
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY deploy/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/dist /usr/share/nginx/html

EXPOSE 8080
