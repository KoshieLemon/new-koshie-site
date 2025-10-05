FROM nginx:1.27-alpine
RUN apk add --no-cache gettext
COPY . /usr/share/nginx/html
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
CMD sh -c "envsubst '\$PORT' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"
