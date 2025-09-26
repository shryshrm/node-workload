const express = require('express');
const promClient = require('prom-client');

const app = express();
app.use(express.json());

// ---------------- Metrics ----------------
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });

const workloadOps = new promClient.Counter({
  name: 'workload_ops_total',
  help: 'Total number of operations executed',
  labelNames: ['type'],
});
registry.registerMetric(workloadOps);

const workloadLatency = new promClient.Histogram({
  name: 'workload_latency_seconds',
  help: 'Latency of each operation in seconds',
  labelNames: ['type'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});
registry.registerMetric(workloadLatency);

const workloadHeap = new promClient.Histogram({
  name: 'workload_heap_kb',
  help: 'Heap allocation in KB per operation',
  labelNames: ['type'],
  buckets: (() => {
    // exponential buckets like in your Go/Java code
    const start = 10, factor = 1.5, count = 20;
    return Array.from({ length: count }, (_, i) => start * Math.pow(factor, i));
  })()
});
registry.registerMetric(workloadHeap);

function getHeapUsedKb() {
  return process.memoryUsage().heapUsed / 1024;
}

// ---------------- Worker Logic ----------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cpuTask() {
  const durationMs = 2.5 + Math.random() * 2.5;
  const durationNs = BigInt(Math.floor(durationMs * 1_000_000)); // ms → ns

  const start = process.hrtime.bigint();
  let x = 0;

  while (process.hrtime.bigint() - start < durationNs) {
    // Keep CPU busy with math
    x += Math.sqrt(Math.random() * 1000);
  }
}

async function constCpuTask() {
  let x = 0;
  const iterations = 1000000;

// Example array of numbers
  const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

  for (let i = 0; i < iterations; i++) {
    // Pick a random value from the array each iteration
    const r = values[Math.floor(Math.random() * values.length)];
    x += Math.sqrt(r);
  }

}

async function ioTask() {
  // simulate IO latency with random sleep (5-10 ms)
  const delay = 2.5;
  await sleep(delay);
}

async function worker(mode, ops, ratio = 0.5) {
  for (let i = 0; i < ops; i++) {
    const t0 = process.hrtime.bigint();

    if (mode === 'cpu') await cpuTask();
    else if (mode === 'io') await ioTask();
    else {
      // MIXED
      if (Math.random() < ratio) await cpuTask();
      else await ioTask();
    }

    const t1 = process.hrtime.bigint();
    const latencySeconds = Number(t1 - t0) / 1e9;

    workloadOps.labels(mode+'_node').inc();
    workloadLatency.labels(mode+'_node').observe(latencySeconds);

    if (i % 1000 === 1) {
      await new Promise(res => setImmediate(res));
    }
  }
  workloadHeap.labels(mode+'_node').observe(getHeapUsedKb());
}

async function runBenchmark(mode, workers, totalOps, ratio = 0.5) {
  const opsPerWorker = Math.floor(totalOps / workers);
  const promises = [];
  // for (let i = 0; i < workers; i++) promises.push(worker(mode, opsPerWorker, ratio));
  // await Promise.all(promises);
  await worker(mode, opsPerWorker, ratio);
}

// ---------------- API ----------------
const API_PORT = 9091;
app.post('/cpu', async (req, res) => {
  const { workers = 1, ops = 1 } = req.body;
  await runBenchmark('cpu', workers, ops);
  res.send(`Triggered CPU workload: workers=${workers}, ops=${ops}`);
});

app.post('/io', async (req, res) => {
  const { workers = 1, ops = 1 } = req.body;
  await runBenchmark('io', workers, ops);
  res.send(`Triggered IO workload: workers=${workers}, ops=${ops}`);
});

app.post('/cpui', async (req, res) => {
  const { workers = 1, ops = 1, ratio = 0.5 } = req.body;
  await runBenchmark('mixed', workers, ops, ratio);
  res.send(`Triggered CPU+IO workload: workers=${workers}, ops=${ops}, ratio=${ratio}`);
});

app.listen(API_PORT, () => {
  console.log(`🚀 API server running on :${API_PORT}`);
});

// ---------------- Prometheus Metrics Server ----------------
const METRICS_PORT = 9092;
const metricsApp = express();
metricsApp.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});
metricsApp.listen(METRICS_PORT, () => {
  console.log(`📊 Prometheus metrics exposed on :${METRICS_PORT}/metrics`);
});
