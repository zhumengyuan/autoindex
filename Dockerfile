FROM node:boron-alpine

COPY src /my_app/src/
COPY test /my_app/test/
COPY Dockerfile LICENSE README.md tsconfig.json tslint.json package.json /my_app/
RUN apk add --no-cache make gcc g++ python && \
    cd /my_app && npm install && \
    npm test && \
    apk del make gcc g++ python

CMD ["/bin/sh", "-c", "(cd /my_app && /usr/local/bin/node dist/src/main.js)"]
