With docker running locally:

`docker run -it --network host --rm -v $(pwd):/mnt grafana/k6 run /mnt/saa.js`

Note: Kindly note that manager-composite connection is sought at port 127.0.0.1:50068 and token generation at 127.0.0.1:50111. 