# Same-origin reverse proxy for Railway — routes wbdash.it to the frontend
# and backend services over Railway's private network. TLS is terminated at
# Railway's edge; this container only ever speaks plain HTTP.
FROM nginx:alpine
COPY nginx.railway.conf /etc/nginx/nginx.conf
EXPOSE 8080
