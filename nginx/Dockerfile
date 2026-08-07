# Same-origin reverse proxy for Railway — routes wbdash.it to the frontend
# and backend services over Railway's private network. TLS is terminated at
# Railway's edge; this container only ever speaks plain HTTP.
FROM nginx:alpine
COPY nginx.railway.conf.template /etc/nginx/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 8080
ENTRYPOINT ["/docker-entrypoint.sh"]
