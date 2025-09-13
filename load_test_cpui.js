import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  scenarios: {
    cpui_scenario: {
      executor: 'ramping-vus',
      exec: 'cpuiTest',
      stages: [
        { duration: '10s', target: 500 },
        { duration: '30s', target: 500 },
        { duration: '10s', target: 0 },
      ],
    },
  },
};

const BASE_URL = 'http://localhost:9091';

export function cpuiTest() {
  const payload = JSON.stringify({ ratio: 0.2 });
  const headers = { 'Content-Type': 'application/json' };
  let res = http.post(`${BASE_URL}/cpui`, payload, { headers });
  check(res, { 'CPUI status 200': (r) => r.status === 200 });
  sleep(0.1);
}
