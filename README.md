Run server : 

`docker build -t node-workload . && docker run -p 9091:9091 -p 9092:9092 --cpus="2.0" --memory="4g" node-workload`

Load test :

`k6 run --out "experimental-prometheus-rw=http://localhost:9090/api/v1/write" load_test_cpu.js` (does not work)

`k6 run --out web-dashboard load_test_cpu.js`

`k6 run --out json=results.json load_test_cpu.js`

`k6 run -e TARGET_CONTAINER=828e689a63e2e348c623fde4e396c418c485d03ae1de0701206898dd3c95ecc6 -e CORES=2 load_test_cpu.js`

Endpoint for checking load test metrics during run : http://127.0.0.1:5665/ui/?endpoint=/
