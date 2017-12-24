
docker build -t s3-server .
docker tag s3-server fastandfearless/s3-server
docker push fastandfearless/s3-server
