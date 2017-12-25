
docker build -t s3-autoindex . && \
docker tag s3-autoindex fastandfearless/s3-autoindex && \
docker push fastandfearless/s3-autoindex
