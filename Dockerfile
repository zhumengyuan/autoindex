FROM node:boron-alpine

COPY src /my_app/src/
COPY test /my_app/test/
COPY Dockerfile LICENSE README.md tsconfig.json tslint.json package.json /my_app/
RUN (cd /my_app && npm install && npm test)

CMD ["/bin/sh", "-c", "(cd /my_app && /usr/local/bin/node dist/src/main.js)"]
