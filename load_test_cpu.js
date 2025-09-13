import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  scenarios: {
    cpu_scenario: {
      executor: 'ramping-vus',
      exec: 'cpuTest',
      stages: [
        { duration: '10s', target: 500 },
        { duration: '30s', target: 500 },
        { duration: '10s', target: 0 },
      ],
    },
  },
};

const BASE_URL = 'http://localhost:9091';


export function cpuTest() {
  const url = `${BASE_URL}/cpu`;
  const payload = JSON.stringify({
    workers: 1,
    ops: 1,
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  let res = http.post(url, payload, params);

  check(res, { 'CPU status 200': (r) => r.status === 200 });
  sleep(0.1);
}