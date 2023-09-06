***How To:***
Connect and listen to manager-composite port at 127.0.0.1:50068 and token generation at 127.0.0.1:50111.
Make sure the client_id and client_secret are updated in the script before executing it.

With docker running locally:

`docker run -it --network host --rm -v $(pwd):/mnt grafana/k6 run /mnt/saa.js`

