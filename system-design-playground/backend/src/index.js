const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5001;

app.use(cors());
app.use(express.json());

const now = () => Date.now();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function createDefaultNodes() {
  return [
    { id: 1, name: 'api-node-a', weight: 5, baseLatencyMs: 80, healthy: true, inFlight: 0, totalRequests: 0, failedRequests: 0, circuitState: 'closed', circuitOpenedAt: null },
    { id: 2, name: 'api-node-b', weight: 3, baseLatencyMs: 140, healthy: true, inFlight: 0, totalRequests: 0, failedRequests: 0, circuitState: 'closed', circuitOpenedAt: null },
    { id: 3, name: 'api-node-c', weight: 2, baseLatencyMs: 220, healthy: true, inFlight: 0, totalRequests: 0, failedRequests: 0, circuitState: 'closed', circuitOpenedAt: null }
  ];
}

const state = {
  strategy: 'round-robin',
  cacheEnabled: true,
  cacheTtlMs: 15000,
  rateLimitPerWindow: 12,
  rateLimitWindowMs: 10000,
  retryStormEnabled: false,
  circuitBreakerEnabled: false,
  backpressureEnabled: false,
  queueCapacity: 12,
  maxInFlightPerNode: 4,
  nextNodeId: 4,
  rrIndex: 0,
  nodes: createDefaultNodes(),
  cache: new Map(),
  rateLimitBuckets: new Map(),
  queue: [],
  deadLetterQueue: [],
  nextJobId: 1,
  recentEvents: [],
  requestSeries: []
};

function pushEvent(type, message, meta = {}) {
  state.recentEvents.unshift({
    id: `${type}-${now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    type,
    message,
    meta
  });
  state.recentEvents = state.recentEvents.slice(0, 50);
}

function recordRequestMetric(result) {
  state.requestSeries.push({
    ts: new Date().toISOString(),
    result,
    perNode: state.nodes.map((node) => ({
      name: node.name,
      totalRequests: node.totalRequests,
      failedRequests: node.failedRequests,
      inFlight: node.inFlight,
      circuitState: node.circuitState
    }))
  });
  state.requestSeries = state.requestSeries.slice(-30);
}

function getHealthyNodes() {
  const current = now();
  return state.nodes.filter((node) => {
    if (!node.healthy) return false;
    if (!state.circuitBreakerEnabled) return true;
    if (node.circuitState === 'open') {
      const elapsed = current - (node.circuitOpenedAt || current);
      if (elapsed > 8000) {
        node.circuitState = 'half-open';
        pushEvent('circuit', `${node.name} moved to half-open`, { node: node.name });
        return true;
      }
      return false;
    }
    return true;
  });
}

function chooseNode() {
  const healthyNodes = getHealthyNodes();
  if (!healthyNodes.length) return null;

  if (state.strategy === 'least-connections') {
    return healthyNodes.reduce((best, current) => {
      if (!best) return current;
      if (current.inFlight < best.inFlight) return current;
      if (current.inFlight === best.inFlight && current.baseLatencyMs < best.baseLatencyMs) return current;
      return best;
    }, null);
  }

  if (state.strategy === 'weighted-round-robin') {
    const pool = [];
    healthyNodes.forEach((node) => {
      const safeWeight = clamp(node.weight || 1, 1, 10);
      for (let i = 0; i < safeWeight; i += 1) pool.push(node);
    });
    const selected = pool[state.rrIndex % pool.length];
    state.rrIndex = (state.rrIndex + 1) % pool.length;
    return selected;
  }

  const selected = healthyNodes[state.rrIndex % healthyNodes.length];
  state.rrIndex = (state.rrIndex + 1) % healthyNodes.length;
  return selected;
}

function cleanExpiredCache() {
  const current = now();
  for (const [key, entry] of state.cache.entries()) {
    if (entry.expiresAt <= current) state.cache.delete(key);
  }
}

function checkRateLimit(clientId = 'default-client') {
  const current = now();
  const bucket = state.rateLimitBuckets.get(clientId);

  if (!bucket || current > bucket.resetAt) {
    state.rateLimitBuckets.set(clientId, {
      count: 1,
      resetAt: current + state.rateLimitWindowMs
    });
    return { allowed: true, remaining: state.rateLimitPerWindow - 1, resetAt: current + state.rateLimitWindowMs };
  }

  if (bucket.count >= state.rateLimitPerWindow) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { allowed: true, remaining: state.rateLimitPerWindow - bucket.count, resetAt: bucket.resetAt };
}

function openCircuit(node, reason) {
  node.circuitState = 'open';
  node.circuitOpenedAt = now();
  pushEvent('circuit', `${node.name} circuit opened`, { node: node.name, reason });
}

function closeCircuit(node) {
  if (node.circuitState !== 'closed') {
    node.circuitState = 'closed';
    node.circuitOpenedAt = null;
    pushEvent('circuit', `${node.name} circuit closed`, { node: node.name });
  }
}

function createSnapshot() {
  cleanExpiredCache();
  return {
    config: {
      strategy: state.strategy,
      cacheEnabled: state.cacheEnabled,
      cacheTtlMs: state.cacheTtlMs,
      rateLimitPerWindow: state.rateLimitPerWindow,
      rateLimitWindowMs: state.rateLimitWindowMs,
      retryStormEnabled: state.retryStormEnabled,
      circuitBreakerEnabled: state.circuitBreakerEnabled,
      backpressureEnabled: state.backpressureEnabled,
      queueCapacity: state.queueCapacity,
      maxInFlightPerNode: state.maxInFlightPerNode
    },
    nodes: state.nodes,
    cache: {
      size: state.cache.size,
      keys: Array.from(state.cache.keys())
    },
    queue: state.queue,
    deadLetterQueue: state.deadLetterQueue,
    recentEvents: state.recentEvents,
    charts: {
      requestSeries: state.requestSeries,
      nodeTotals: state.nodes.map((node) => ({ name: node.name, requests: node.totalRequests, failures: node.failedRequests }))
    },
    metrics: {
      totalRequestsServed: state.nodes.reduce((sum, node) => sum + node.totalRequests, 0),
      totalFailures: state.nodes.reduce((sum, node) => sum + node.failedRequests, 0),
      healthyNodes: getHealthyNodes().length,
      totalNodes: state.nodes.length,
      circuitOpenCount: state.nodes.filter((node) => node.circuitState === 'open').length,
      queuedJobs: state.queue.length
    }
  };
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'system-design-playground-backend', time: new Date().toISOString() });
});

app.get('/api/state', (_req, res) => {
  res.json(createSnapshot());
});

app.post('/api/config', (req, res) => {
  const {
    strategy,
    cacheEnabled,
    cacheTtlMs,
    rateLimitPerWindow,
    retryStormEnabled,
    circuitBreakerEnabled,
    backpressureEnabled,
    queueCapacity,
    maxInFlightPerNode
  } = req.body || {};

  if (strategy) state.strategy = strategy;
  if (typeof cacheEnabled === 'boolean') state.cacheEnabled = cacheEnabled;
  if (typeof cacheTtlMs === 'number') state.cacheTtlMs = clamp(cacheTtlMs, 1000, 120000);
  if (typeof rateLimitPerWindow === 'number') state.rateLimitPerWindow = clamp(rateLimitPerWindow, 1, 100);
  if (typeof retryStormEnabled === 'boolean') state.retryStormEnabled = retryStormEnabled;
  if (typeof circuitBreakerEnabled === 'boolean') state.circuitBreakerEnabled = circuitBreakerEnabled;
  if (typeof backpressureEnabled === 'boolean') state.backpressureEnabled = backpressureEnabled;
  if (typeof queueCapacity === 'number') state.queueCapacity = clamp(queueCapacity, 1, 100);
  if (typeof maxInFlightPerNode === 'number') state.maxInFlightPerNode = clamp(maxInFlightPerNode, 1, 20);

  pushEvent('config', 'Simulation settings updated', {
    strategy: state.strategy,
    cacheEnabled: state.cacheEnabled,
    rateLimitPerWindow: state.rateLimitPerWindow,
    retryStormEnabled: state.retryStormEnabled,
    circuitBreakerEnabled: state.circuitBreakerEnabled,
    backpressureEnabled: state.backpressureEnabled
  });

  res.json(createSnapshot());
});

app.post('/api/nodes', (req, res) => {
  const { name, weight, baseLatencyMs } = req.body || {};
  const node = {
    id: state.nextNodeId++,
    name: name || `api-node-${state.nextNodeId - 1}`,
    weight: clamp(Number(weight) || 1, 1, 10),
    baseLatencyMs: clamp(Number(baseLatencyMs) || 100, 20, 1500),
    healthy: true,
    inFlight: 0,
    totalRequests: 0,
    failedRequests: 0,
    circuitState: 'closed',
    circuitOpenedAt: null
  };

  state.nodes.push(node);
  pushEvent('node', `Added ${node.name}`, node);
  res.status(201).json({ node, state: createSnapshot() });
});

app.post('/api/nodes/:id/toggle-health', (req, res) => {
  const id = Number(req.params.id);
  const node = state.nodes.find((item) => item.id === id);
  if (!node) return res.status(404).json({ error: 'Node not found' });

  node.healthy = !node.healthy;
  pushEvent('node', `${node.name} marked ${node.healthy ? 'healthy' : 'unhealthy'}`, { id: node.id, healthy: node.healthy });
  return res.json({ node, state: createSnapshot() });
});

app.get('/api/resource/:key', async (req, res) => {
  cleanExpiredCache();
  const key = req.params.key;
  const clientId = req.headers['x-client-id'] || 'dashboard-client';
  const rate = checkRateLimit(clientId);

  if (!rate.allowed) {
    recordRequestMetric('rate-limited');
    pushEvent('rate-limit', `Rate limit hit for ${clientId}`, { clientId, key });
    return res.status(429).json({ error: 'Rate limit exceeded', rateLimit: rate, state: createSnapshot() });
  }

  if (state.cacheEnabled && state.cache.has(key)) {
    const cached = state.cache.get(key);
    recordRequestMetric('cache-hit');
    pushEvent('cache', `Cache hit for ${key}`, { key });
    return res.json({ source: 'cache', key, value: cached.value, latencyMs: 4, rateLimit: rate, state: createSnapshot() });
  }

  const node = chooseNode();
  if (!node) {
    recordRequestMetric('unavailable');
    pushEvent('failover', 'No healthy nodes available', { key });
    return res.status(503).json({ error: 'No healthy nodes available', rateLimit: rate, state: createSnapshot() });
  }

  if (state.backpressureEnabled && node.inFlight >= state.maxInFlightPerNode) {
    node.failedRequests += 1;
    recordRequestMetric('backpressure-rejected');
    pushEvent('backpressure', `${node.name} rejected request under pressure`, { node: node.name, inFlight: node.inFlight });
    if (state.circuitBreakerEnabled && node.failedRequests >= 3) {
      openCircuit(node, 'backpressure saturation');
    }
    return res.status(429).json({ error: 'Backpressure active: node saturated', state: createSnapshot() });
  }

  node.inFlight += 1;
  const jitter = randomBetween(10, 120);
  const latencyMs = node.baseLatencyMs + jitter + node.inFlight * 15;

  await new Promise((resolve) => setTimeout(resolve, latencyMs));

  node.inFlight -= 1;

  const simulatedFailure = state.circuitBreakerEnabled && (node.baseLatencyMs > 180 || state.retryStormEnabled) && Math.random() < 0.25;
  if (simulatedFailure) {
    node.failedRequests += 1;
    recordRequestMetric('origin-failed');
    pushEvent('request', `${node.name} failed serving ${key}`, { node: node.name, key });
    if (node.failedRequests >= 3) {
      openCircuit(node, 'repeated origin failures');
    }
    return res.status(502).json({ error: `Upstream failure on ${node.name}`, state: createSnapshot() });
  }

  node.totalRequests += 1;
  if (node.circuitState === 'half-open') {
    closeCircuit(node);
  }

  const response = {
    source: 'origin',
    key,
    value: `Value for ${key} from ${node.name}`,
    servedBy: node.name,
    latencyMs,
    rateLimit: rate
  };

  if (state.cacheEnabled) {
    state.cache.set(key, { value: response.value, expiresAt: now() + state.cacheTtlMs });
  }

  recordRequestMetric('origin-served');
  pushEvent('request', `Served ${key} from ${node.name}`, { node: node.name, key, latencyMs, cached: false });
  return res.json({ ...response, state: createSnapshot() });
});

app.post('/api/burst', async (req, res) => {
  const total = clamp(Number(req.body?.count) || 10, 1, 50);
  const results = [];

  for (let i = 0; i < total; i += 1) {
    const clientId = `burst-client-${Math.floor(i / 3)}`;
    const rate = checkRateLimit(clientId);

    if (!rate.allowed) {
      results.push({ ok: false, status: 429, clientId, reason: 'rate-limit' });
      recordRequestMetric('burst-rate-limited');
      continue;
    }

    const node = chooseNode();
    if (!node) {
      results.push({ ok: false, status: 503, clientId, reason: 'no-node' });
      recordRequestMetric('burst-unavailable');
      continue;
    }

    if (state.backpressureEnabled && node.inFlight >= state.maxInFlightPerNode) {
      node.failedRequests += 1;
      results.push({ ok: false, status: 429, clientId, node: node.name, reason: 'backpressure' });
      recordRequestMetric('burst-backpressure');
      if (state.circuitBreakerEnabled && node.failedRequests >= 3) {
        openCircuit(node, 'burst saturation');
      }
      continue;
    }

    node.totalRequests += 1;
    results.push({ ok: true, node: node.name, clientId });
    recordRequestMetric('burst-served');
  }

  pushEvent('burst', `Simulated burst of ${total} requests`, {
    total,
    accepted: results.filter((item) => item.ok).length,
    throttled: results.filter((item) => item.status === 429).length
  });

  res.json({ results, state: createSnapshot() });
});

app.post('/api/queue/enqueue', (req, res) => {
  if (state.backpressureEnabled && state.queue.length >= state.queueCapacity) {
    pushEvent('backpressure', 'Queue rejected new job at capacity', { queueDepth: state.queue.length, capacity: state.queueCapacity });
    return res.status(429).json({ error: 'Queue backpressure: capacity reached', state: createSnapshot() });
  }

  const { type, payload } = req.body || {};
  const job = {
    id: state.nextJobId++,
    type: type || 'email-send',
    payload: payload || { target: 'demo-user' },
    attempts: 0,
    maxAttempts: 3,
    status: 'queued'
  };

  state.queue.push(job);
  pushEvent('queue', `Enqueued job ${job.id}`, { jobId: job.id, type: job.type });
  res.status(201).json({ job, state: createSnapshot() });
});

app.post('/api/queue/process', (req, res) => {
  if (!state.queue.length) {
    return res.json({ processed: [], state: createSnapshot(), message: 'Queue is empty' });
  }

  const processed = [];
  const batchSize = clamp(Number(req.body?.count) || 3, 1, 10);

  for (let i = 0; i < batchSize; i += 1) {
    const job = state.queue.shift();
    if (!job) break;

    job.attempts += 1;
    const failChance = state.retryStormEnabled ? 0.75 : 0.35;
    const didFail = Math.random() < failChance;

    if (didFail) {
      if (job.attempts >= job.maxAttempts) {
        job.status = 'dead-lettered';
        state.deadLetterQueue.push(job);
        processed.push({ id: job.id, status: job.status, attempts: job.attempts });
        pushEvent('dlq', `Job ${job.id} moved to dead-letter queue`, { jobId: job.id });
      } else {
        job.status = 'retrying';
        state.queue.push(job);
        processed.push({ id: job.id, status: job.status, attempts: job.attempts });
        pushEvent('retry', `Job ${job.id} failed and was requeued`, { jobId: job.id, attempts: job.attempts });
      }
    } else {
      job.status = 'completed';
      processed.push({ id: job.id, status: job.status, attempts: job.attempts });
      pushEvent('queue', `Job ${job.id} completed`, { jobId: job.id, attempts: job.attempts });
    }
  }

  res.json({ processed, state: createSnapshot() });
});

app.post('/api/reset', (_req, res) => {
  state.strategy = 'round-robin';
  state.cacheEnabled = true;
  state.cacheTtlMs = 15000;
  state.rateLimitPerWindow = 12;
  state.retryStormEnabled = false;
  state.circuitBreakerEnabled = false;
  state.backpressureEnabled = false;
  state.queueCapacity = 12;
  state.maxInFlightPerNode = 4;
  state.rrIndex = 0;
  state.nextNodeId = 4;
  state.nodes = createDefaultNodes();
  state.cache = new Map();
  state.rateLimitBuckets = new Map();
  state.queue = [];
  state.deadLetterQueue = [];
  state.nextJobId = 1;
  state.recentEvents = [];
  state.requestSeries = [];
  pushEvent('reset', 'Simulation reset to defaults');
  res.json(createSnapshot());
});

app.listen(PORT, () => {
  console.log(`System Design Playground backend running on http://localhost:${PORT}`);
});
