import http from 'k6/http';
import { check, sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { URL } from 'https://jslib.k6.io/url/1.0.0/index.js';

// --- Config ---
const BASE_URL = __ENV.BASE_URL || 'http://localhost:9091';
const PROM_URL = __ENV.PROM_URL || 'http://localhost:9090/api/v1/query';
const CONTAINER_ID = __ENV.TARGET_CONTAINER || null;
const TEST_INTERVAL = '10s';

export let options = {
  scenarios: {
    cpui_scenario: {
      executor: 'ramping-vus',
      exec: 'cpuiTest',
      stages: [
        { duration: '10s', target: 5000 },
        { duration: '30s', target: 5000 },
        { duration: '10s', target: 0 },
      ],
      gracefulStop: '0s',
      gracefulRampDown: '0s',
    },
  },
};

export function cpuiTest() {
  const payload = JSON.stringify({ ratio: 0.8 });
  const headers = { 'Content-Type': 'application/json' };
  let res = http.post(`${BASE_URL}/cpui`, payload, { headers });
  check(res, { 'CPUI status 200': (r) => r.status === 200 });
  sleep(0.1);
}

// --- Helper to query Prometheus ---
function queryPrometheus(q) {
  const url = new URL(PROM_URL);
  url.searchParams.set('query', q);
  const res = http.get(url.toString());
  if (res.status !== 200) {
    console.error(`Prometheus query failed: ${res.status}`);
    return null;
  }
  const json = JSON.parse(res.body);
  if (json.status !== 'success' || !json.data || !json.data.result) return null;
  return json.data.result;
}

// --- Summary using Prometheus metrics ---
export function handleSummary(data) {
  console.log('\n=== Test Summary (Prometheus) ===');

  // --- CPU usage ---
  let cpuQuery = `(rate(container_cpu_usage_seconds_total{id="/docker/${CONTAINER_ID}"}[${TEST_INTERVAL}]) / 2) * 100`;
  const cpuRes = queryPrometheus(cpuQuery);
  let avgCpu = 0;
  if (cpuRes && cpuRes.length > 0) {
    // each element in cpuRes has a `value` array: [ <timestamp>, "<value>" ]
    avgCpu = parseFloat(cpuRes[0].value[1]) || 0;
  }
  console.log(`Avg CPU usage: ${avgCpu.toFixed(2)} %`);


  // --- RPS ---
  let rpsQuery = `rate(workload_ops_total{type="cpu_io_java"}[${TEST_INTERVAL}])`;
  const rpsRes = queryPrometheus(rpsQuery);
  const rps = rpsRes && rpsRes.length > 0 ? parseFloat(rpsRes[0].value[1]) : 0;
  console.log(`RPS: ${rps.toFixed(2)}`);

  // --- p95 latency ---
  let p95Query = `histogram_quantile(0.90, rate(workload_latency_seconds_bucket{type="cpu_io_java"}[${TEST_INTERVAL}]))`;
  const p95Res = queryPrometheus(p95Query);
  const p95 = p95Res && p95Res.length > 0 ? parseFloat(p95Res[0].value[1]) * 1000 : 0; // convert to ms
  console.log(`p95 latency: ${p95.toFixed(2)} ms`);

  // --- Add k6-native metrics ---
  const httpReqDuration = data.metrics['http_req_duration'];
  const httpReqs = data.metrics['http_reqs'];

  if (httpReqDuration) {
    const p95Latency = httpReqDuration.values['p(95)'] || 0;
    console.log(`Client side p95 latency : ${p95Latency.toFixed(2)} ms`);
  }

  if (httpReqs) {
    const totalReqs = httpReqs.values.count || 0;
    const testDuration = data.state.testRunDurationMs / 1000; // seconds
    const avgRPS = totalReqs / testDuration;
    console.log(`Client side avg RPS : ${avgRPS.toFixed(2)}`);
  }

  // also include default text summary
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

